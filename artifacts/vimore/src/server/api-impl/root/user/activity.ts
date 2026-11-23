import { NextRequest, NextResponse } from 'next/server';
import { Query, ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile, getClientIp } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const session = await getAuthenticatedProfile(req);
    const userId = session?.authUser.$id || String(body.userId || '').trim();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = String(
      session?.profileDoc?.username || body.username || 'unknown'
    ).trim();
    const now = new Date().toISOString();
    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || '';

    const db = getAdminDatabases();
    try {
      await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
        is_online: true,
        last_seen_at: now,
      });
    } catch {
      // ignore if user doc doesn't exist yet
    }

    try {
      const existing = await db.listDocuments(DATABASE_ID, COL.USER_ACTIVITY, [
        Query.equal('user_id', userId),
        Query.limit(1),
      ]);
      if (existing.documents[0]) {
        await db.updateDocument(DATABASE_ID, COL.USER_ACTIVITY, existing.documents[0].$id, {
          username,
          ip_address: ip,
          user_agent: userAgent,
          last_seen: now,
        });
      } else {
        await db.createDocument(DATABASE_ID, COL.USER_ACTIVITY, ID.unique(), {
          user_id: userId,
          username,
          ip_address: ip,
          user_agent: userAgent,
          last_seen: now,
        });
      }
    } catch {
      // ignore if USER_ACTIVITY schema differs
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Activity tracking failed' }, { status: 500 });
  }
}
