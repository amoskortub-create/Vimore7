import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getFileUrl } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const videoFileId = String(body.videoFileId || '').trim();
    const coverFileId = body.coverFileId ? String(body.coverFileId).trim() : '';

    if (!videoFileId) {
      return NextResponse.json({ error: 'videoFileId is required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const videoUrl = getFileUrl(BUCKET.REEL_MEDIA, videoFileId);
    const coverUrl = coverFileId ? getFileUrl(BUCKET.REEL_MEDIA, coverFileId) : undefined;

    const postDoc = await db.createDocument(DATABASE_ID, COL.POSTS, ID.unique(), {
      user_id: session.authUser.$id,
      username: String(session.profileDoc.username || body.username || ''),
      name: String(session.profileDoc.name || session.profileDoc.username || ''),
      avatar: String(session.profileDoc.avatar || ''),
      type: 'reel',
      content: String(body.caption || '').trim(),
      video_id: videoFileId,
      video_url: videoUrl,
      media_url: videoUrl,
      ...(coverUrl ? { cover_url: coverUrl, thumbnail_url: coverUrl } : {}),
      duration: Number(body.totalDuration || 0),
      effect: String(body.effect || 'none'),
      visibility: String(body.visibility || 'public'),
      allow_comments: body.allowComments !== false,
      allow_duet: body.allowDuet !== false,
      allow_downloads: body.allowDownloads !== false,
      sound_name: body.selectedSound?.title || body.selectedSound?.name || undefined,
      likes_count: 0,
      unlikes_count: 0,
      comments_count: 0,
      shares_count: 0,
      views_count: 0,
    });

    try {
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        posts_count: Number(session.profileDoc.posts_count || 0) + 1,
      });
    } catch {
      // non-fatal
    }

    return NextResponse.json({ ok: true, postId: postDoc.$id, post: postDoc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Reel upload failed' }, { status: 500 });
  }
}
