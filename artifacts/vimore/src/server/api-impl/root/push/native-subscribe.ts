import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabases, DATABASE_ID } from "@/lib/appwrite-server";
import { getSessionUser } from "@/lib/session";
import { ID, Query } from "node-appwrite";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const COLLECTION_ID = "native_push_tokens";

async function sendUnreadDigest(
  db: ReturnType<typeof getAdminDatabases>,
  userId: string,
  token: string,
  platform: "android" | "web",
) {
  const [messages, userNotifications, recipientNotifications] = await Promise.allSettled([
    db.listDocuments(DATABASE_ID, "messages", [
      Query.equal("receiver_id", userId),
      Query.limit(5000),
    ]),
    db.listDocuments(DATABASE_ID, "notifications", [
      Query.equal("user_id", userId),
      Query.limit(5000),
    ]),
    db.listDocuments(DATABASE_ID, "notifications", [
      Query.equal("recipient_id", userId),
      Query.limit(5000),
    ]),
  ]);
  const messageCount = messages.status === "fulfilled"
    ? messages.value.documents.filter((doc: any) => doc.is_read !== true && doc.is_read !== 1 && doc.is_read !== "true").length
    : 0;
  const unreadNotificationIds = new Set<string>();
  for (const result of [userNotifications, recipientNotifications]) {
    if (result.status === "fulfilled") {
      result.value.documents.forEach((doc: any) => {
        if (doc.is_read !== true && doc.is_read !== 1 && doc.is_read !== "true") {
          unreadNotificationIds.add(doc.$id);
        }
      });
    }
  }
  const notificationCount = unreadNotificationIds.size;
  if (!messageCount && !notificationCount) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return;

  const app = getApps()[0] || initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  const url = messageCount ? "/messages" : "/notifications";
  await getMessaging(app).send({
    token,
    notification: {
      title: "ViMore — catch up",
      body: `You have ${messageCount} unread message${messageCount === 1 ? "" : "s"} and ${notificationCount} unread notification${notificationCount === 1 ? "" : "s"}.`,
    },
    data: {
      type: "UNREAD_DIGEST",
      url,
    },
    ...(platform === "android" ? { android: {
      priority: "high",
      notification: { channelId: "vimore_default_v2", sound: "default" },
    } } : {
      webpush: {
        data: { type: "UNREAD_DIGEST", url, vimore_fcm_web: "1" },
        notification: {
          data: { type: "UNREAD_DIGEST", url, vimore_fcm_web: "1" },
        },
        fcmOptions: { link: new URL(url, "https://vimore.cfd").toString() },
      },
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );

    const { token, platform = "android" } = await req.json();
    if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
      return NextResponse.json(
        { error: "Invalid FCM token." },
        { status: 400 },
      );
    }
    if (platform !== "android" && platform !== "web") {
      return NextResponse.json(
        { error: "Unsupported platform." },
        { status: 400 },
      );
    }

    const db = getAdminDatabases();
    const existing = await db.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.equal("token", token),
      Query.limit(1),
    ]);
    const isNewToken = existing.total === 0;
    const data = {
      user_id: session.userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    };

    if (existing.total > 0) {
      await db.updateDocument(
        DATABASE_ID,
        COLLECTION_ID,
        existing.documents[0].$id,
        data,
      );
    } else {
      await db.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
        ...data,
        created_at: new Date().toISOString(),
      });
    }

    if (isNewToken) {
      try {
        await sendUnreadDigest(db, session.userId, token, platform);
      } catch (error: any) {
        console.warn("[push/fcm-subscribe] unread digest delivery failed:", error?.message || error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.warn(
      "[push/fcm-subscribe] storage failed:",
      error?.message || error,
    );
    return NextResponse.json(
      { error: "Native push token storage is not configured." },
      { status: 503 },
    );
  }
}
