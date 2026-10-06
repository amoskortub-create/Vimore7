import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';
import { ID, Query } from 'node-appwrite';
import webpush from 'web-push';

export const maxDuration = 15;

const COLLECTION_ID = 'push_subscriptions';
const VAPID_PUBLIC =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BGRfT6eaMS4SJwWAA4ZM-IR32_qDO1xAoyq3N5LqF6kLgPXLdBrC1WExJEt0daf091gcfZhlSezLv4FqWCFikk0';

async function sendUnreadDigest(db: ReturnType<typeof getAdminDatabases>, userId: string, subscription: any) {
  const results = await Promise.allSettled([
    db.listDocuments(DATABASE_ID, 'messages', [
      Query.equal('receiver_id', userId),
      Query.limit(5000),
    ]),
    db.listDocuments(DATABASE_ID, 'notifications', [
      Query.equal('user_id', userId),
      Query.limit(5000),
    ]),
    db.listDocuments(DATABASE_ID, 'notifications', [
      Query.equal('recipient_id', userId),
      Query.limit(5000),
    ]),
  ]);
  const messageCount = results[0].status === 'fulfilled'
    ? results[0].value.documents.filter((doc: any) => doc.is_read !== true && doc.is_read !== 1 && doc.is_read !== 'true').length
    : 0;
  const unreadNotificationIds = new Set<string>();
  const unreadUserCount = results[1].status === 'fulfilled'
    ? results[1].value.documents.filter((doc: any) => {
      const unread = doc.is_read !== true && doc.is_read !== 1 && doc.is_read !== 'true';
      if (unread) unreadNotificationIds.add(doc.$id);
      return unread;
    }).length
    : 0;
  const unreadRecipientCount = results[2].status === 'fulfilled'
    ? results[2].value.documents.filter((doc: any) => {
      const unread = doc.is_read !== true && doc.is_read !== 1 && doc.is_read !== 'true';
      if (unread) unreadNotificationIds.add(doc.$id);
      return unread;
    }).length
    : 0;
  const notificationCount = Math.max(unreadUserCount, unreadRecipientCount, unreadNotificationIds.size);
  if (!messageCount && !notificationCount) return;

  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) return;

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:amoskortub@gmail.com',
      VAPID_PUBLIC,
      privateKey,
    );
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify({
        title: 'ViMore — catch up',
        body: `You have ${messageCount} unread message${messageCount === 1 ? '' : 's'} and ${notificationCount} unread notification${notificationCount === 1 ? '' : 's'}.`,
        url: messageCount ? '/messages' : '/notifications',
        tag: 'vimore-unread-backlog',
        data: { type: 'UNREAD_DIGEST', url: messageCount ? '/messages' : '/notifications' },
        badgeCount: messageCount + notificationCount,
        timestamp: Date.now(),
      }),
    );
  } catch (err: any) {
    console.warn('[push/subscribe] unread digest delivery failed:', err?.statusCode || err?.message || err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const { endpoint, keys, expirationTime } = body || {};
    if (
      typeof endpoint !== 'string' || endpoint.length > 2048 ||
      typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    try {
      const db = getAdminDatabases();
      const existing = await db.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.equal('endpoint', endpoint),
        Query.limit(1),
      ]);

      const payload = {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        expiration_time: expirationTime ? String(expirationTime) : null,
        user_id: session.userId,
        updated_at: new Date().toISOString(),
      };

      let isNewSubscription = existing.total === 0;
      if (existing.total > 0) {
        isNewSubscription = existing.documents[0].user_id !== session.userId;
        await db.updateDocument(DATABASE_ID, COLLECTION_ID, existing.documents[0].$id, payload);
      } else {
        await db.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
          ...payload,
          created_at: new Date().toISOString(),
        });
      }

      if (isNewSubscription) {
        await sendUnreadDigest(db, session.userId, { endpoint, keys });
      }

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      // Collection may not exist yet; log and accept so the client doesn't retry forever.
      console.warn('[push/subscribe] storage failed:', err?.message || err);
      return NextResponse.json({ ok: true, stored: false });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Bad request' }, { status: 400 });
  }
}
