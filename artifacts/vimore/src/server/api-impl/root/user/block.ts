import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL, BUCKET, getFileUrl, avatarFallback } from '@/lib/appwrite';
import { findUserByUsername, getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.BLOCKED_USERS, [
      Query.equal('blocker_id', session.authUser.$id),
      Query.limit(200),
    ]);

    const blockedIds = [...new Set(res.documents.map((d: any) => d.blocked_id).filter(Boolean))];
    let userMap: Record<string, any> = {};
    if (blockedIds.length > 0) {
      try {
        const usersRes = await db.listDocuments(DATABASE_ID, COL.USERS, [
          Query.equal('$id', blockedIds.slice(0, 100)),
          Query.limit(100),
        ]);
        userMap = Object.fromEntries(usersRes.documents.map((u: any) => [u.$id, u]));
      } catch {}
    }

    const blocked = res.documents.map((doc: any) => {
      const u = userMap[doc.blocked_id];
      return {
        docId: doc.$id,
        userId: doc.blocked_id,
        username: u?.username || doc.blocked_username || '',
        name: u?.name || u?.display_name || doc.blocked_username || 'User',
        avatar: u?.avatar_id ? getFileUrl(BUCKET.AVATARS, u.avatar_id) : avatarFallback(u?.name || doc.blocked_username || 'U'),
      };
    });

    return NextResponse.json({ ok: true, blocked });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load blocked users' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'block').toLowerCase();
    const rawUsername = String(body.username || '').trim().replace(/^@/, '');
    const rawTargetId = String(body.targetUserId || '').trim();

    const db = getAdminDatabases();
    let targetUser: any = null;
    if (rawTargetId) {
      try {
        targetUser = await db.getDocument(DATABASE_ID, COL.USERS, rawTargetId);
      } catch {}
    }
    if (!targetUser && rawUsername) {
      targetUser = await findUserByUsername(rawUsername);
    }

    const targetId = targetUser?.$id || rawTargetId;
    const targetUsername = targetUser?.username || rawUsername;

    if (!targetId && !targetUsername) {
      return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
    }
    if (targetId === session.authUser.$id) {
      return NextResponse.json({ error: 'You cannot block yourself.' }, { status: 400 });
    }

    if (action === 'unblock') {
      const queries: string[] = [Query.equal('blocker_id', session.authUser.$id), Query.limit(50)];
      if (targetId) queries.push(Query.equal('blocked_id', targetId));
      else queries.push(Query.equal('blocked_username', targetUsername));

      const existing = await db.listDocuments(DATABASE_ID, COL.BLOCKED_USERS, queries);
      for (const doc of existing.documents) {
        await db.deleteDocument(DATABASE_ID, COL.BLOCKED_USERS, doc.$id);
      }
      return NextResponse.json({ ok: true, blocked: false, username: targetUsername, userId: targetId });
    }

    if (!targetId) {
      return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
    }

    const existing = await db.listDocuments(DATABASE_ID, COL.BLOCKED_USERS, [
      Query.equal('blocker_id', session.authUser.$id),
      Query.equal('blocked_id', targetId),
      Query.limit(1),
    ]);

    if (existing.documents.length === 0) {
      await db.createDocument(DATABASE_ID, COL.BLOCKED_USERS, ID.unique(), {
        blocker_id: session.authUser.$id,
        blocked_id: targetId,
        blocked_username: targetUsername || '',
      });
    }

    return NextResponse.json({
      ok: true,
      blocked: true,
      username: targetUsername,
      userId: targetId,
      name: targetUser?.name || targetUsername,
      avatar: targetUser?.avatar_id
        ? getFileUrl(BUCKET.AVATARS, targetUser.avatar_id)
        : avatarFallback(targetUser?.name || targetUsername || 'U'),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Block update failed' }, { status: 500 });
  }
}
