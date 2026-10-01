import { createHash } from "node:crypto";
import { DATABASE_ID } from "@/lib/appwrite-server";

type CallLogEvent = "completed" | "missed" | "declined";

function getMessageText(event: CallLogEvent, callType: unknown, duration = 0) {
  const label = callType === "audio" ? "audio" : "video";
  if (event === "missed") return `Missed ${label} call`;
  if (event === "declined") return `Declined ${label} call`;

  const totalSeconds = Math.max(0, Math.floor(Number(duration) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const formattedDuration = hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${label[0].toUpperCase()}${label.slice(1)} call · ${formattedDuration}`;
}

function isDuplicateDocument(error: unknown) {
  const value = error as { code?: number; type?: string } | null;
  return value?.code === 409 || value?.type === "document_already_exists";
}

async function getProfile(db: any, userId: string, cache: Map<string, Promise<any>>) {
  if (!cache.has(userId)) {
    cache.set(
      userId,
      db.getDocument(DATABASE_ID, "users", userId).catch(() => null),
    );
  }
  return cache.get(userId)!;
}

async function createCallMessage(
  db: any,
  call: any,
  event: CallLogEvent,
  eventKey: string,
  duration: number,
  profiles: Map<string, Promise<any>>,
) {
  const senderId = String(call.caller_id || "");
  const receiverId = String(call.callee_id || "");
  const isGroupCall = String(call.channel_id || "").startsWith("group_call_");
  if (!senderId || !receiverId || (!isGroupCall && senderId === receiverId)) return;

  const [sender, receiver] = await Promise.all([
    getProfile(db, senderId, profiles),
    getProfile(db, receiverId, profiles),
  ]);
  const senderName = String(sender?.name || sender?.username || "ViMore user").slice(0, 128);
  const senderAvatar = String(sender?.avatar || sender?.avatar_id || "").slice(0, 512);
  const text = getMessageText(event, call.type, duration);
  const collectionId = isGroupCall ? "group_messages" : "messages";
  const clusterId = isGroupCall
    ? String(call.channel_id).slice("group_call_".length)
    : [
        String(sender?.username || senderId),
        String(receiver?.username || receiverId),
      ].sort().join("_");

  const messageData: Record<string, unknown> = {
    cluster_id: clusterId,
    sender_id: senderId,
    sender_name: senderName,
    type: "text",
    text,
    is_read: false,
    is_view_once: false,
    is_viewed: false,
  };
  if (senderAvatar) messageData.sender_avatar = senderAvatar;
  if (!isGroupCall) messageData.receiver_id = receiverId;

  const documentId = createHash("sha256").update(eventKey).digest("hex").slice(0, 36);
  try {
    await db.createDocument(DATABASE_ID, collectionId, documentId, messageData);
  } catch (error) {
    if (!isDuplicateDocument(error)) throw error;
  }
}

/**
 * Writes call history into the same collections that the chat UI already reads.
 * Deterministic document IDs make retries safe and prevent duplicate group logs.
 */
export async function persistCallChatLogs(
  db: any,
  call: any,
  event: CallLogEvent,
  options: {
    eventKey: string;
    duration?: number;
    participantCalls?: any[];
  },
) {
  const profiles = new Map<string, Promise<any>>();
  const isGroupCall = String(call.channel_id || "").startsWith("group_call_");

  if (isGroupCall) {
    await createCallMessage(
      db,
      call,
      event,
      `call-log:v1:${options.eventKey}:group:${event}`,
      options.duration || 0,
      profiles,
    );
    return;
  }

  const candidateCalls = event === "completed"
    ? (options.participantCalls || [call]).filter((item) =>
        item.status === "accepted" || typeof item.started_at === "string",
      )
    : [call];
  const distinctPairs = new Map<string, any>();
  for (const item of candidateCalls) {
    if (!item.caller_id || !item.callee_id || item.caller_id === item.callee_id) continue;
    distinctPairs.set(`${item.caller_id}:${item.callee_id}`, item);
  }

  await Promise.all([...distinctPairs.values()].map((item) =>
    createCallMessage(
      db,
      item,
      event,
      `call-log:v1:${options.eventKey}:direct:${item.caller_id}:${item.callee_id}:${event}`,
      options.duration || 0,
      profiles,
    ),
  ));
}