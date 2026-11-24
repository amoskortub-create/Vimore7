import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { COL } from '@/lib/appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawMediaUrl = String(body.rawMediaUrl || '').trim();
    const mediaId = body.mediaId ? String(body.mediaId).trim() : '';
    const type = String(body.type || 'image').trim() || 'image';
    const duration = Math.max(1, Math.min(90, Number(body.duration) || 5));
    const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : '';

    const db = getAdminDatabases();
    const expires_at = new Date(Date.now() + 86400000).toISOString();

    const storyDoc = await db.createDocument(DATABASE_ID, COL.STORIES, ID.unique(), {
      user_id: session.authUser.$id,
      expires_at,
      views_count: 0,
      story_url: rawMediaUrl,
    });

    const segData: Record<string, any> = {
      story_id: storyDoc.$id,
      type,
      order_index: 0,
      duration,
      story_url: rawMediaUrl,
    };
    if (mediaId) segData.media_id = mediaId;
    if (text) segData.text = text;

    const segmentDoc = await db.createDocument(DATABASE_ID, COL.STORY_SEGMENTS, ID.unique(), segData);

    return NextResponse.json({ ok: true, storyDoc, segmentDoc, expires_at });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not save story.' }, { status: 500 });
  }
}
