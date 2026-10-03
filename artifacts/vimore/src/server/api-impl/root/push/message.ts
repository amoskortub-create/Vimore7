import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getAdminDatabases, DATABASE_ID } from "@/lib/appwrite-server";
import { getSessionUser } from "@/lib/session";
import { sendPushToUsers } from "@/server/native-push";

const MESSAGE_COLLECTIONS = new Set(["messages", "group_messages"]);
const ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json();
    if (
      typeof body?.messageId !== "string" ||
      !ID_PATTERN.test(body.messageId) ||
      !MESSAGE_COLLECTIONS.has(body.collection)
    ) {
      return NextResponse.json({ error: "A valid message is required." }, { status: 400 });
    }

    const db = getAdminDatabases();
    const message = await db.getDocument(
      DATABASE_ID,
      body.collection,
      body.messageId,
    );
    if (message.sender_id !== session.userId) {
      return NextResponse.json({ error: "You cannot notify for this message." }, { status: 403 });
    }

    let recipientIds: string[];
    if (body.collection === "messages") {
      if (
        typeof message.receiver_id !== "string" ||
        !ID_PATTERN.test(message.receiver_id) ||
        message.receiver_id === session.userId
      ) {
        return NextResponse.json({ error: "The message has no valid recipient." }, { status: 400 });
      }
      recipientIds = [message.receiver_id];
    } else {
      if (typeof message.cluster_id !== "string" || !ID_PATTERN.test(message.cluster_id)) {
        return NextResponse.json({ error: "The group message is invalid." }, { status: 400 });
      }
      const memberIds: string[] = [];
      let cursor: string | undefined;
      do {
        const queries = [
          Query.equal("cluster_id", message.cluster_id),
          Query.limit(100),
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const memberships = await db.listDocuments(
          DATABASE_ID,
          "cluster_members",
          queries,
        );
        memberships.documents.forEach((member: any) => {
          if (typeof member.user_id === "string") memberIds.push(member.user_id);
        });
        cursor =
          memberships.documents.length === 100
            ? memberships.documents[memberships.documents.length - 1].$id
            : undefined;
      } while (cursor);
      if (!memberIds.includes(session.userId)) {
        return NextResponse.json({ error: "You are not a member of this group." }, { status: 403 });
      }
      recipientIds = [...new Set(memberIds)].filter((userId) => userId !== session.userId);
    }

    const bodyText =
      typeof message.text === "string" && message.text.trim()
        ? message.text.trim().slice(0, 120)
        : message.type === "voice"
          ? "Sent you a voice message"
          : message.media_url || message.media_id
            ? "Sent you a photo"
            : "Sent you a message";
    await sendPushToUsers(recipientIds, {
      title: message.sender_name || "New message",
      body: bodyText,
      url: `/messages?chat=${encodeURIComponent(message.cluster_id || "")}`,
      tag: `vimore-message-${message.$id}`,
      data: {
        type: "MESSAGE",
        clusterId: message.cluster_id || "",
        senderId: session.userId,
      },
    });

    return NextResponse.json({ ok: true, recipients: recipientIds.length });
  } catch (error) {
    console.error("[push/message] delivery failed:", error);
    return NextResponse.json({ error: "Could not deliver message notifications." }, { status: 500 });
  }
}
