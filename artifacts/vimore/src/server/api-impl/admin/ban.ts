import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { requireAdminUser, logSecurityEvent } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    const reason = String(body.reason || 'Policy violation').trim();
    const note = String(body.note || '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    if (userId === admin.authUser.$id) {
      return NextResponse.json({ error: 'Cannot ban your own account' }, { status: 400 });
    }

    const db = getAdminDatabases();
    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      status: 'banned',
    });

    try {
      await db.createDocument(DATABASE_ID, COL.USER_BANS, ID.unique(), {
        user_id: userId,
        banned_by: admin.authUser.$id,
        reason,
        note,
        created_at: new Date().toISOString(),
      });
    } catch {
      // non-fatal if collection schema differs
    }

    await logSecurityEvent({
      event_type: 'ADMIN_BAN',
      severity: 'CRITICAL',
      user_id: userId,
      details: `Banned by @${admin.profileDoc.username || admin.authUser.$id}: ${reason}`,
    });

    return NextResponse.json({ ok: true, status: 'banned' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Ban failed' }, { status: 500 });
  }
}
