import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { ID, Query } from 'node-appwrite';

export const maxDuration = 20;

const USERS = 'users';
const FOLLOWS = 'follows';
const FRIEND_REQUESTS = 'friend_requests';
const NOTIFICATIONS = 'notifications';

async function listAllDocuments(db: ReturnType<typeof getAdminDatabases>, collectionId: string, queries: string[]) {
  const documents: any[] = [];
  let cursor: string | undefined;

  while (true) {
    const page = await db.listDocuments(DATABASE_ID, collectionId, [
      ...queries,
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    documents.push(...page.documents);
    if (page.documents.length < 100) return documents;
    cursor = page.documents[page.documents.length - 1]?.$id;
    if (!cursor) return documents;
  }
}

async function deleteUnacceptedConversation(db: ReturnType<typeof getAdminDatabases>, left: any, right: any) {
  const [acceptedSent, acceptedReceived] = await Promise.all([
    db.listDocuments(DATABASE_ID, FRIEND_REQUESTS, [
      Query.equal('from_user_id', left.$id),
      Query.equal('to_user_id', right.$id),
      Query.equal('status', 'ACCEPTED'),
      Query.limit(1),
    ]),
    db.listDocuments(DATABASE_ID, FRIEND_REQUESTS, [
      Query.equal('from_user_id', right.$id),
      Query.equal('to_user_id', left.$id),
      Query.equal('status', 'ACCEPTED'),
      Query.limit(1),
    ]),
  ]);
  if (acceptedSent.documents.length || acceptedReceived.documents.length) return 0;

  const clusterId = [left.username, right.username].sort().join('_');
  const messages = await listAllDocuments(db, 'messages', [Query.equal('cluster_id', clusterId)]);
  await Promise.all(messages.map(message => db.deleteDocument(DATABASE_ID, 'messages', message.$id)));
  return messages.length;
}

type FriendAction = 'send' | 'confirm' | 'decline' | 'cancel' | 'unfriend' | 'cleanup';

/**
 * Admin-backed friend-request actions.
 *
 * Why this route exists:
 * The friend flow needs to write to `friend_requests` / `follows` AND update
 * the *other* user's `users` document (followers_count / following_count).
 * A normal logged-in user has no document-level permission to mutate another
 * user's row, so doing this directly from the browser throws Appwrite's
 * "The current user is not authorized to perform the requested action" (401).
 *
 * The identity is ALWAYS derived from the session — never trusted from the body.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const rl = rateLimit(`friends-action:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 });
    }

    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as FriendAction;
    const targetUsername = typeof body?.targetUsername === 'string' ? body.targetUsername.trim() : '';

    if (!action || !['send', 'confirm', 'decline', 'cancel', 'unfriend', 'cleanup'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const meId = session.userId;
    const me: any = await db.getDocument(DATABASE_ID, USERS, meId).catch(() => null);
    if (!me) return NextResponse.json({ error: 'Session user not found.' }, { status: 404 });

    if (action === 'cleanup') {
      const [sentAccepted, receivedAccepted] = await Promise.all([
        listAllDocuments(db, FRIEND_REQUESTS, [
          Query.equal('from_user_id', meId),
          Query.equal('status', 'ACCEPTED'),
        ]),
        listAllDocuments(db, FRIEND_REQUESTS, [
          Query.equal('to_user_id', meId),
          Query.equal('status', 'ACCEPTED'),
        ]),
      ]);
      const acceptedIds = new Set<string>();
      sentAccepted.forEach(request => request.to_user_id && acceptedIds.add(request.to_user_id));
      receivedAccepted.forEach(request => request.from_user_id && acceptedIds.add(request.from_user_id));

      const acceptedUsers: any[] = [];
      for (let offset = 0; offset < acceptedIds.size; offset += 100) {
        const ids = [...acceptedIds].slice(offset, offset + 100);
        const users = await db.listDocuments(DATABASE_ID, USERS, [
          Query.equal('$id', ids),
          Query.limit(100),
        ]);
        acceptedUsers.push(...users.documents);
      }
      const acceptedClusterIds = new Set(
        acceptedUsers.map(user => [me.username, user.username].sort().join('_')),
      );

      const [sentMessages, receivedMessages] = await Promise.all([
        listAllDocuments(db, 'messages', [Query.equal('sender_id', meId)]),
        listAllDocuments(db, 'messages', [Query.equal('receiver_id', meId)]),
      ]);
      const messages = [...new Map([...sentMessages, ...receivedMessages].map(message => [message.$id, message])).values()];
      const staleMessages = messages.filter(message => {
        if (message.sender_id === meId && message.receiver_id) return !acceptedIds.has(message.receiver_id);
        if (message.receiver_id === meId && message.sender_id) return !acceptedIds.has(message.sender_id);
        return typeof message.cluster_id === 'string'
          && (message.cluster_id.startsWith(`${me.username}_`) || message.cluster_id.endsWith(`_${me.username}`))
          && !acceptedClusterIds.has(message.cluster_id);
      });
      await Promise.all(staleMessages.map(message => db.deleteDocument(DATABASE_ID, 'messages', message.$id)));
      return NextResponse.json({ ok: true, deletedCount: staleMessages.length });
    }

    if (!targetUsername) {
      return NextResponse.json({ error: 'targetUsername is required.' }, { status: 400 });
    }
    const targetRes = await db.listDocuments(DATABASE_ID, USERS, [
      Query.equal('username', targetUsername),
      Query.limit(1),
    ]);
    const target: any = targetRes.documents[0];
    if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    if (target.$id === meId) {
      return NextResponse.json({ error: 'Cannot perform this action on yourself.' }, { status: 400 });
    }

    const num = (v: any) => (typeof v === 'number' && v >= 0 ? v : 0);

    // ── helpers ──────────────────────────────────────────────────────────────
    const followExists = async (followerId: string, followingId: string) => {
      const r = await db.listDocuments(DATABASE_ID, FOLLOWS, [
        Query.equal('follower_id', followerId),
        Query.equal('following_id', followingId),
        Query.limit(1),
      ]);
      return r.documents.length > 0;
    };

    const createFollow = async (
      follower: any,
      following: any,
    ) => {
      if (await followExists(follower.$id, following.$id)) return false;
      await db.createDocument(DATABASE_ID, FOLLOWS, ID.unique(), {
        follower_id: follower.$id,
        following_id: following.$id,
        follower_username: follower.username,
        following_username: following.username,
      });
      await db.updateDocument(DATABASE_ID, USERS, follower.$id, {
        following_count: num(follower.following_count) + 1,
      }).catch(() => {});
      await db.updateDocument(DATABASE_ID, USERS, following.$id, {
        followers_count: num(following.followers_count) + 1,
      }).catch(() => {});
      return true;
    };

    const deleteFollow = async (follower: any, following: any) => {
      const r = await db.listDocuments(DATABASE_ID, FOLLOWS, [
        Query.equal('follower_id', follower.$id),
        Query.equal('following_id', following.$id),
      ]);
      if (r.documents.length === 0) return false;
      for (const doc of r.documents) {
        await db.deleteDocument(DATABASE_ID, FOLLOWS, doc.$id).catch(() => {});
      }
      await db.updateDocument(DATABASE_ID, USERS, follower.$id, {
        following_count: Math.max(0, num(follower.following_count) - 1),
      }).catch(() => {});
      await db.updateDocument(DATABASE_ID, USERS, following.$id, {
        followers_count: Math.max(0, num(following.followers_count) - 1),
      }).catch(() => {});
      return true;
    };

    const notify = async (payload: Record<string, any>) => {
      await db.createDocument(DATABASE_ID, NOTIFICATIONS, ID.unique(), payload).catch(() => {});
    };

    const meName = me.name || me.username;

    // ── actions ────────────────────────────────────────────────────────────
    if (action === 'send') {
      // Avoid duplicate pending requests.
      const existing = await db.listDocuments(DATABASE_ID, FRIEND_REQUESTS, [
        Query.equal('from_user_id', meId),
        Query.equal('to_user_id', target.$id),
        Query.equal('status', 'PENDING'),
        Query.limit(1),
      ]);
      if (existing.documents.length === 0) {
        await db.createDocument(DATABASE_ID, FRIEND_REQUESTS, ID.unique(), {
          from_user_id: meId,
          to_user_id: target.$id,
          status: 'PENDING',
        });
      }

      await createFollow(me, target);

      await notify({
        user_id: target.$id,
        from_user_id: meId,
        from_user_name: meName,
        from_user_avatar: me.avatar || '',
        type: 'FRIEND_REQUEST',
        title: 'Friend Request',
        content: `${meName} (@${me.username}) sent you a friend request.`,
        message: `${meName} (@${me.username}) sent you a friend request.`,
        is_read: false,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === 'confirm') {
      // Accept any pending requests from target → me.
      const pending = await db.listDocuments(DATABASE_ID, FRIEND_REQUESTS, [
        Query.equal('from_user_id', target.$id),
        Query.equal('to_user_id', meId),
        Query.equal('status', 'PENDING'),
      ]);
      if (pending.documents.length === 0) {
        return NextResponse.json({ error: 'Friend request is no longer pending.' }, { status: 409 });
      }
      for (const doc of pending.documents) {
        await db.updateDocument(DATABASE_ID, FRIEND_REQUESTS, doc.$id, { status: 'ACCEPTED' });
      }

      // Ensure mutual follows exist.
      await createFollow(me, target);
      await createFollow(target, me);

      await notify({
        user_id: target.$id,
        from_user_id: meId,
        from_user_name: meName,
        from_user_avatar: me.avatar || '',
        type: 'FRIEND_ACCEPT',
        title: 'Friend Request Accepted',
        content: `${meName} (@${me.username}) accepted your friend request.`,
        message: `${meName} (@${me.username}) accepted your friend request.`,
        is_read: false,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === 'decline') {
      const pending = await db.listDocuments(DATABASE_ID, FRIEND_REQUESTS, [
        Query.equal('from_user_id', target.$id),
        Query.equal('to_user_id', meId),
        Query.equal('status', 'PENDING'),
      ]);
      for (const doc of pending.documents) {
        await db.deleteDocument(DATABASE_ID, FRIEND_REQUESTS, doc.$id);
      }
      await deleteFollow(target, me);
      const deletedCount = await deleteUnacceptedConversation(db, me, target);
      return NextResponse.json({ ok: true, deletedCount });
    }

    if (action === 'cancel') {
      const pending = await db.listDocuments(DATABASE_ID, FRIEND_REQUESTS, [
        Query.equal('from_user_id', meId),
        Query.equal('to_user_id', target.$id),
        Query.equal('status', 'PENDING'),
      ]);
      for (const doc of pending.documents) {
        await db.deleteDocument(DATABASE_ID, FRIEND_REQUESTS, doc.$id).catch(() => {});
      }
      await deleteFollow(me, target);
      const deletedCount = await deleteUnacceptedConversation(db, me, target);
      return NextResponse.json({ ok: true, deletedCount });
    }

    // action === 'unfriend'
    const [sent, recv] = await Promise.all([
      db.listDocuments(DATABASE_ID, FRIEND_REQUESTS, [
        Query.equal('from_user_id', meId),
        Query.equal('to_user_id', target.$id),
        Query.equal('status', 'ACCEPTED'),
      ]),
      db.listDocuments(DATABASE_ID, FRIEND_REQUESTS, [
        Query.equal('from_user_id', target.$id),
        Query.equal('to_user_id', meId),
        Query.equal('status', 'ACCEPTED'),
      ]),
    ]);
    for (const doc of [...sent.documents, ...recv.documents]) {
      await db.deleteDocument(DATABASE_ID, FRIEND_REQUESTS, doc.$id).catch(() => {});
    }
    await deleteFollow(me, target);
    await deleteFollow(target, me);
    const deletedCount = await deleteUnacceptedConversation(db, me, target);

    return NextResponse.json({ ok: true, deletedCount });
  } catch (err: any) {
    console.error('[friends/action] error:', err?.message ?? err);
    return NextResponse.json({ error: err?.message || 'Bad request' }, { status: 400 });
  }
}
