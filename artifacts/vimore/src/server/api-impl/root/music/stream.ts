import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const songId = String(body.songId || body.trackId || '').trim();
    if (!songId) {
      return NextResponse.json({ error: 'songId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const doc = await db.getDocument(DATABASE_ID, COL.TRACKS, songId);
    const nextPlays = Number(doc.plays_count || doc.streams_count || 0) + 1;
    await db.updateDocument(DATABASE_ID, COL.TRACKS, songId, {
      plays_count: nextPlays,
    });

    return NextResponse.json({ ok: true, playsCount: nextPlays });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Stream tracking failed' }, { status: 500 });
  }
}
