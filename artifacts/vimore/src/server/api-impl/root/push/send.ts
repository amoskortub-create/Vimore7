import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getAdminDatabases, DATABASE_ID } from "@/lib/appwrite-server";
import { getSessionUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { Query } from "node-appwrite";

export const maxDuration = 30;

const SUBS_COLLECTION = "push_subscriptions";
const MAX_TARGETS = 100;
const FCM_TOKENS_COLLECTION = "native_push_tokens";

const VAPID_PUBLIC =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BGRfT6eaMS4SJwWAA4ZM-IR32_qDO1xAoyq3N5LqF6kLgPXLdBrC1WExJEt0daf091gcfZhlSezLv4FqWCFikk0";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:amoskortub@gmail.com";

let vapidConfigured = false;
let firebaseConfigWarningLogged = false;
function ensureVapid() {
  if (vapidConfigured) return;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidConfigured = true;
  } catch (err) {
    console.warn(
      "[push/send] VAPID setup failed:",
      (err as any)?.message || err,
    );
  }
}

function getFirebaseMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    if (!firebaseConfigWarningLogged) {
      console.warn(
        "[push/send] Firebase Admin credentials are not configured; FCM delivery is unavailable.",
      );
      firebaseConfigWarningLogged = true;
    }
    return null;
  }

  const app =
    getApps()[0] ||
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  return getMessaging(app);
}

interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  image?: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
  badgeCount?: number;
  data?: Record<string, any>;
  actions?: { action: string; title: string; icon?: string }[];
}

async function isAuthorizedPush(
  db: ReturnType<typeof getAdminDatabases>,
  senderId: string,
  targetIds: string[],
  payload: PushPayload,
  sourceId?: string,
  sourceIds: string[] = [],
): Promise<boolean> {
  const type = String(payload.data?.type || '').toUpperCase();

  if (type === 'MESSAGE') {
    if (!sourceId) return false;
    let source: any = null;
    let collection = 'messages';
    try {
      source = await db.getDocument(DATABASE_ID, collection, sourceId);
    } catch {
      collection = 'group_messages';
      try {
        source = await db.getDocument(DATABASE_ID, collection, sourceId);
      } catch {
        return false;
      }
    }
    if (source.sender_id !== senderId) return false;
    if (collection === 'messages') {
      return targetIds.every((targetId) => source.receiver_id === targetId);
    }
    try {
      const members = await db.listDocuments(DATABASE_ID, 'cluster_members', [
        Query.equal('cluster_id', source.cluster_id),
        Query.limit(100),
      ]);
      const memberIds = new Set(members.documents.map((doc: any) => String(doc.user_id || '')));
      return targetIds.every((targetId) => targetId !== senderId && memberIds.has(targetId));
    } catch {
      return false;
    }
  }

  if (type === 'INCOMING_CALL' || type === 'MISSED_CALL') {
    const allowedCallIds = [...new Set([sourceId, ...sourceIds].filter((id): id is string => typeof id === 'string'))];
    if (!allowedCallIds.length) return false;
    const calls = await Promise.all(allowedCallIds.map(async (id) => {
      try {
        return await db.getDocument(DATABASE_ID, 'calls', id);
      } catch {
        return null;
      }
    }));
    return targetIds.every((targetId) => calls.some((call: any) =>
      call?.caller_id === senderId &&
      call?.callee_id === targetId &&
      (type === 'MISSED_CALL'
        ? call.status === 'missed'
        : ['dialing', 'ringing'].includes(String(call.status))),
    ));
  }

  if (!sourceId) return false;
  try {
    const notification: any = await db.getDocument(DATABASE_ID, 'notifications', sourceId);
    const recipientId = notification.user_id || notification.recipient_id;
    return notification.from_user_id === senderId && targetIds.every((targetId) => recipientId === targetId);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

    const rl = rateLimit(`push-send:${session.userId}:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { userId, userIds, payload, sourceId, sourceIds } = body as {
      userId?: string;
      userIds?: string[];
      payload: PushPayload;
      sourceId?: string;
      sourceIds?: string[];
    };

    const rawTargets = (
      userIds && userIds.length ? userIds : userId ? [userId] : []
    ).filter(Boolean);
    if (!rawTargets.length || !payload) {
      return NextResponse.json(
        { error: "userId(s) and payload required" },
        { status: 400 },
      );
    }

    const targets = rawTargets
      .filter(
        (id): id is string =>
          typeof id === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(id),
      )
      .slice(0, MAX_TARGETS);

    if (!targets.length) {
      return NextResponse.json(
        { error: "No valid user IDs provided." },
        { status: 400 },
      );
    }

    if (payload.title && String(payload.title).length > 200) {
      payload.title = String(payload.title).slice(0, 200);
    }
    if (payload.body && String(payload.body).length > 500) {
      payload.body = String(payload.body).slice(0, 500);
    }
    if (payload.url && typeof payload.url === "string") {
      try {
        const u = new URL(payload.url, "https://vimore.cfd");
        if (
          ![
            "/",
            "/notifications",
            "/messages",
            "/reels",
            "/music",
            "/marketplace",
            "/events",
          ].some((p) => u.pathname.startsWith(p))
        ) {
          payload.url = "/notifications";
        } else {
          // FCM links must stay on ViMore even if a caller supplies an
          // absolute URL with an otherwise allowed path.
          payload.url = `${u.pathname}${u.search}${u.hash}`;
        }
      } catch {
        payload.url = "/notifications";
      }
    }

    const db = getAdminDatabases();
    if (!(await isAuthorizedPush(
      db,
      session.userId,
      targets,
      payload,
      typeof sourceId === 'string' ? sourceId : undefined,
      Array.isArray(sourceIds) ? sourceIds.filter((id): id is string => typeof id === 'string') : [],
    ))) {
      return NextResponse.json({ error: 'Push event could not be verified.' }, { status: 403 });
    }

    const subs: Array<{
      $id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }> = [];
    for (const uid of targets) {
      try {
        const res = await db.listDocuments(DATABASE_ID, SUBS_COLLECTION, [
          Query.equal("user_id", uid),
          Query.limit(10),
        ]);
        res.documents.forEach((d: any) =>
          subs.push({
            $id: d.$id,
            endpoint: d.endpoint,
            p256dh: d.p256dh,
            auth: d.auth,
          }),
        );
      } catch (err: any) {
        console.warn(
          "[push/send] sub lookup failed for",
          uid,
          err?.message || err,
        );
      }
    }

    const json = JSON.stringify({
      title: payload.title || "ViMore",
      body: payload.body || "",
      icon: payload.icon || "/icons/icon-192.png",
      badge: payload.badge || "/icons/icon-192.png",
      image: payload.image,
      url: payload.url || "/notifications",
      tag: payload.tag,
      renotify: payload.renotify,
      requireInteraction: payload.requireInteraction,
      silent: payload.silent,
      badgeCount: payload.badgeCount,
      data: payload.data || {},
      actions: payload.actions || [],
      timestamp: Date.now(),
    });

    let sent = 0;
    let failed = 0;

    if (subs.length) ensureVapid();
    await Promise.all(
      subs.map(async (s) => {
        try {
          if (!vapidConfigured) {
            failed++;
            return;
          }
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            json,
          );
          sent++;
        } catch (err: any) {
          failed++;
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            try {
              await db.deleteDocument(DATABASE_ID, SUBS_COLLECTION, s.$id);
            } catch {}
          } else {
            console.warn(
              "[push/send] delivery failed:",
              status,
              err?.body || err?.message,
            );
          }
        }
      }),
    );

    let nativeSent = 0;
    let nativeFailed = 0;
    let webSent = 0;
    let webFailed = 0;
    const messaging = getFirebaseMessaging();
    if (messaging) {
      const fcmTokens: Array<{ $id: string; token: string; platform: string }> = [];
      for (const uid of targets) {
        try {
          const result = await db.listDocuments(
            DATABASE_ID,
            FCM_TOKENS_COLLECTION,
            [Query.equal("user_id", uid), Query.limit(10)],
          );
          result.documents.forEach((d: any) =>
            fcmTokens.push({
              $id: d.$id,
              token: d.token,
              platform: String(d.platform || "android"),
            }),
          );
        } catch (err: any) {
          console.warn(
            "[push/send] native token lookup failed:",
            err?.message || err,
          );
        }
      }

      const appUrl = new URL(payload.url || "/notifications", "https://vimore.cfd").toString();
      const callPush = String(payload.data?.type || "").toUpperCase() === "INCOMING_CALL";
      const webActions = callPush
        ? [
            { action: "accept-call", title: "✅ Accept" },
            { action: "decline-call", title: "❌ Decline" },
          ]
        : (payload.actions || []).map(({ action, title, icon }) => ({ action, title, icon }));
      const fcmData = Object.fromEntries(
        Object.entries({
          ...payload.data,
          url: payload.url || "/notifications",
          tag: payload.tag || "",
        })
          .filter(([, value]) => Boolean(value))
          .map(([key, value]) => [
            key,
            typeof value === "string" ? value : JSON.stringify(value),
          ]),
      );
      for (let index = 0; index < fcmTokens.length; index += 500) {
        const batch = fcmTokens.slice(index, index + 500);
        try {
          const response = await messaging.sendEachForMulticast({
            tokens: batch.map((item) => item.token),
            notification: {
              title: payload.title || "ViMore",
              body: payload.body || "",
              imageUrl: payload.image,
            },
            data: fcmData,
            android: {
              priority: "high",
              notification: {
                channelId:
                  payload.data?.type === "INCOMING_CALL"
                    ? "vimore_calls_v2"
                    : "vimore_default_v2",
                icon: "ic_launcher",
                sound: "default",
              },
            },
            webpush: {
              data: { ...fcmData, vimore_fcm_web: "1" },
              notification: {
                icon: payload.icon || "/icons/icon-192.png",
                badge: payload.badge || "/icons/icon-192.png",
                image: payload.image,
                tag: payload.tag,
                requireInteraction: callPush || payload.requireInteraction,
                actions: webActions,
                data: { ...fcmData, vimore_fcm_web: "1" },
              },
              fcmOptions: { link: appUrl },
            },
          });
          response.responses.forEach((result, responseIndex) => {
            const isWeb = batch[responseIndex].platform === "web";
            if (result.success) {
              if (isWeb) webSent++;
              else nativeSent++;
            } else if (isWeb) {
              webFailed++;
            } else {
              nativeFailed++;
            }
          });
          await Promise.all(
            response.responses.map(async (result, responseIndex) => {
              const code = (result.error as any)?.code;
              if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token"
              ) {
                try {
                  await db.deleteDocument(
                    DATABASE_ID,
                    FCM_TOKENS_COLLECTION,
                    batch[responseIndex].$id,
                  );
                } catch {}
              }
            }),
          );
        } catch (err: any) {
          console.warn(
            "[push/send] FCM delivery failed:",
            err?.message || err,
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      failed,
      total: subs.length,
      reason: subs.length || nativeSent || webSent ? undefined : "no_subscriptions",
      nativeSent,
      nativeFailed,
      webSent,
      webFailed,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Bad request" },
      { status: 400 },
    );
  }
}
