import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { findUserByUsername, getAuthenticatedProfile, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const targetUsername = String(body.targetUsername || '').trim().replace(/^@/, '');

    if (!action || !targetUsername) {
      return NextResponse.json({ error: 'action and targetUsername are required' }, { status: 400 });
    }

    const target = await findUserByUsername(targetUsername);
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const meId = session.authUser.$id;
    const targetId = target.$id;
    if (meId === targetId) {
      return NextResponse.json({ error: 'Cannot perform friend action on yourself' }, { status: 400 });
    }

    const db = getAdminDatabases();

    if (action === 'send') {
      const existing = await db.listDocuments(DATABASE_ID, COL.FRIEND_REQUESTS, [
        Query.equal('sender_id', meId),
        Query.equal('receiver_id', targetId),
        Query.limit(5),
      ]);
      const pending = existing.documents.find((d: any) => d.status === 'PENDING');
      if (!pending) {
        await db.createDocument(DATABASE_ID, COL.FRIEND_REQUESTS, ID.unique(), {
          sender_id: meId,
          sender_username: session.profileDoc.username || '',
          receiver_id: targetId,
          receiver_username: target.username || '',
          status: 'PENDING',
        });
        await safeNotify({
          user_id: targetId,
          from_user_id: meId,
          from_user_name: session.profileDoc.name || session.profileDoc.username,
          from_user_avatar: session.profileDoc.avatar || '',
          type: 'FRIEND_REQUEST',
          title: 'New Handshake Request',
          content: `${session.profileDoc.name || session.profileDoc.username} sent you a handshake request.`,
          action_href: `/profile/${session.profileDoc.username}`,
        });
      }
      return NextResponse.json({ ok: true, status: 'PENDING' });
    }

    if (action === 'confirm') {
      const reqs = await db.listDocuments(DATABASE_ID, COL.FRIEND_REQUESTS, [
        Query.equal('sender_id', targetId),
        Query.equal('receiver_id', meId),
        Query.limit(10),
      ]);
      for (const r of reqs.documents) {
        if (r.status === 'PENDING') {
          await db.updateDocument(DATABASE_ID, COL.FRIEND_REQUESTS, r.$id, { status: 'ACCEPTED' });
        }
      }

      try {
        await db.updateDocument(DATABASE_ID, COL.USERS, meId, {
          friends_count: Number(session.profileDoc.friends_count || 0) + 1,
        });
        await db.updateDocument(DATABASE_ID, COL.USERS, targetId, {
          friends_count: Number(target.friends_count || 0) + 1,
        });
      } catch {
        // non-fatal
      }

      await safeNotify({
        user_id: targetId,
        from_user_id: meId,
        from_user_name: session.profileDoc.name || session.profileDoc.username,
        from_user_avatar: session.profileDoc.avatar || '',
        type: 'FRIEND_ACCEPT',
        title: 'Handshake Confirmed',
        content: `${session.profileDoc.name || session.profileDoc.username} accepted your handshake request.`,
        action_href: `/profile/${session.profileDoc.username}`,
      });

      return NextResponse.json({ ok: true, status: 'ACCEPTED' });
    }

    if (action === 'cancel' || action === 'unfriend') {
      const [sent, received] = await Promise.all([
        db.listDocuments(DATABASE_ID, COL.FRIEND_REQUESTS, [
          Query.equal('sender_id', meId),
          Query.equal('receiver_id', targetId),
          Query.limit(10),
        ]),
        db.listDocuments(DATABASE_ID, COL.FRIEND_REQUESTS, [
          Query.equal('sender_id', targetId),
          Query.equal('receiver_id', meId),
          Query.limit(10),
        ]),
      ]);
      for (const r of [...sent.documents, ...received.documents]) {
        await db.deleteDocument(DATABASE_ID, COL.FRIEND_REQUESTS, r.$id).catch(() => {});
      }

      if (action === 'unfriend') {
        try {
          await db.updateDocument(DATABASE_ID, COL.USERS, meId, {
            friends_count: Math.max(0, Number(session.profileDoc.friends_count || 0) - 1),
          });
          await db.updateDocument(DATABASE_ID, COL.USERS, targetId, {
            friends_count: Math.max(0, Number(target.friends_count || 0) - 1),
          });
        } catch {
          // non-fatal
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Friend action failed' }, { status: 500 });
  }
}
