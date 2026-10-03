"use client";

import { databases, DATABASE_ID, COL, ID } from "@/lib/appwrite";
import { firePush } from "@/lib/push-fire";

type NotificationData = Record<string, unknown> & {
  user_id?: unknown;
  from_user_id?: string;
  type?: string;
  title?: string;
  content?: string;
  message?: string;
  action_href?: string;
  action_url?: string;
  avatar?: string;
  from_user_avatar?: string;
};

export async function createNotificationDocument(data: NotificationData) {
  const document = await databases.createDocument(
    DATABASE_ID,
    COL.NOTIFICATIONS,
    ID.unique(),
    data,
  );

  if (
    typeof data.user_id === "string" &&
    data.user_id &&
    data.user_id !== data.from_user_id
  ) {
    firePush({
      userId: data.user_id,
      title: data.title || "ViMore",
      body: data.content || data.message || "",
      url: data.action_href || data.action_url || "/notifications",
      icon: data.avatar || data.from_user_avatar || "/icons/icon-192.png",
      tag: `vimore-notification-${document.$id}`,
      data: { type: data.type || "SYSTEM", notificationId: document.$id },
    });
  }

  return document;
}
