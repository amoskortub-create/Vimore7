import "server-only";

import { randomUUID } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getAdminDatabases, DATABASE_ID } from "@/lib/appwrite-server";
import { Query } from "node-appwrite";
import webpush from "web-push";

const TOKENS_COLLECTION = "native_push_tokens";
const WEB_SUBSCRIPTIONS_COLLECTION = "push_subscriptions";

export interface PushDeliveryPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  data?: Record<string, string>;
  call?: boolean;
}

function getMessagingClient() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.warn("[native-push] Firebase Admin credentials are not configured.");
    return null;
  }

  const app =
    getApps().find((item) => item.name === "vimore-push") ||
    initializeApp(
      { credential: cert({ projectId, clientEmail, privateKey }) },
      "vimore-push",
    );
  return getMessaging(app);
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushDeliveryPayload,
): Promise<void> {
  const targets = [...new Set(userIds)].filter(
    (id) => typeof id === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(id),
  );
  if (!targets.length) return;

  const db = getAdminDatabases();
  const subscriptions: Array<{
    $id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }> = [];
  const tokens: Array<{ documentId: string; token: string }> = [];
  for (const userId of targets) {
    try {
      const [nativeResult, webResult] = await Promise.all([
        db.listDocuments(DATABASE_ID, TOKENS_COLLECTION, [
          Query.equal("user_id", userId),
          Query.limit(10),
        ]),
        db.listDocuments(DATABASE_ID, WEB_SUBSCRIPTIONS_COLLECTION, [
          Query.equal("user_id", userId),
          Query.limit(10),
        ]),
      ]);
      nativeResult.documents.forEach((document: any) => {
        if (typeof document.token === "string") tokens.push({ documentId: document.$id, token: document.token });
      });
      webResult.documents.forEach((document: any) => {
        if (document.endpoint && document.p256dh && document.auth) {
          subscriptions.push({
            $id: document.$id,
            endpoint: document.endpoint,
            p256dh: document.p256dh,
            auth: document.auth,
          });
        }
      });
    } catch (error) {
      console.error("[push] subscription lookup failed:", error);
    }
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (subscriptions.length && vapidPublic && vapidPrivate) {
    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || "mailto:amoskortub@gmail.com",
        vapidPublic,
        vapidPrivate,
      );
      const webPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        url: payload.url,
        tag: payload.tag,
        data: payload.data || {},
        timestamp: Date.now(),
      });
      await Promise.all(subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            webPayload,
          );
        } catch (error: any) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            try {
              await db.deleteDocument(DATABASE_ID, WEB_SUBSCRIPTIONS_COLLECTION, subscription.$id);
            } catch (cleanupError) {
              console.error("[push] stale web subscription cleanup failed:", cleanupError);
            }
          } else {
            console.error("[push] Web Push delivery failed:", error?.statusCode || error);
          }
        }
      }));
    } catch (error) {
      console.error("[push] Web Push setup failed:", error);
    }
  } else if (subscriptions.length && (!vapidPublic || !vapidPrivate)) {
    console.warn("[push] VAPID credentials are not configured; Web Push delivery is unavailable.");
  }

  const messaging = getMessagingClient();
  if (!messaging) return;

  for (let offset = 0; offset < tokens.length; offset += 500) {
    const batch = tokens.slice(offset, offset + 500);
    try {
      const result = await messaging.sendEachForMulticast({
        tokens: batch.map(({ token }) => token),
        notification: { title: payload.title, body: payload.body },
        data: {
          ...payload.data,
          url: payload.url,
          tag: payload.tag,
        },
        android: {
          priority: "high",
          notification: {
            channelId: payload.call ? "vimore_calls_v2" : "vimore_default_v2",
            tag: payload.tag,
            sound: "default",
            icon: "ic_launcher",
          },
        },
      });

      await Promise.all(
        result.responses.map(async (response, index) => {
          if (response.success) return;
          const code = response.error?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            try {
              await db.deleteDocument(
                DATABASE_ID,
                TOKENS_COLLECTION,
                batch[index].documentId,
              );
            } catch (error) {
              console.error("[native-push] stale token cleanup failed:", error);
            }
            return;
          }
          console.error("[native-push] FCM delivery failed:", code || response.error);
        }),
      );
    } catch (error) {
      console.error("[native-push] FCM batch delivery failed:", error);
    }
  }

}

export async function sendNativeNotification(
  userId: string,
  title: string,
  body: string,
  type = "SYSTEM",
  url = "/notifications",
): Promise<void> {
  await sendPushToUsers([userId], {
    title,
    body,
    url,
    tag: `vimore-notification-${type.toLowerCase()}-${randomUUID()}`,
    data: { type },
  });
}
