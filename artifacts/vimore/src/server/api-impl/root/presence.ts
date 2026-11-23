import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch {
      body = {};
    }

    const session = await getAuthenticatedProfile(req);
    const targetUserId = session?.authUser.$id || String(body.userId || '').trim();
    if (!targetUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session && body.userId && body.userId !== session.authUser.$id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isOnline = body.isOnline !== false;
    const db = getAdminDatabases();
    await db.updateDocument(DATABASE_ID, COL.USERS, targetUserId, {
      is_online: isOnline,
      last_seen_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, isOnline });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Presence update failed' }, { status: 500 });
  }
}
