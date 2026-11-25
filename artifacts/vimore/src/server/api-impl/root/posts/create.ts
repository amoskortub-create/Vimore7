import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { COL } from '@/lib/appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { getAuthenticatedProfile, safeNotify } from '@/lib/server-helpers';
import { CREDIT_LIMITS } from '@/lib/credit-pricing';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const db = getAdminDatabases();
    const userId = session.authUser.$id;
    const profileDoc = session.profileDoc;

    const content = typeof body.content === 'string' ? body.content : '';
    const hashtags = Array.isArray(body.hashtags)
      ? body.hashtags.map((t: unknown) => String(t)).filter(Boolean).slice(0, 30)
      : [];
    const taggedUsers = Array.isArray(body.tagged_users)
      ? body.tagged_users.map((u: unknown) => String(u)).filter(Boolean).slice(0, 25)
      : [];
    const imageIds = Array.isArray(body.image_ids)
      ? body.image_ids.map((id: unknown) => String(id)).filter(Boolean).slice(0, 10)
      : [];
    const videoId = typeof body.video_id === 'string' && body.video_id.trim() ? body.video_id.trim() : '';

    const docData: Record<string, any> = {
      user_id: userId,
      content,
      likes_count: 0,
      unlikes_count: 0,
      comments_count: 0,
      shares_count: 0,
      views_count: 0,
      is_locked: Boolean(body.is_locked),
      is_boosted: false,
      boost_current_views: 0,
      comments_disabled: Boolean(body.comments_disabled),
    };

    if (hashtags.length > 0) docData.hashtags = hashtags;
    if (taggedUsers.length > 0) docData.tagged_users = taggedUsers;
    if (typeof body.link_preview === 'string' && body.link_preview) docData.link_preview = body.link_preview;
    if (imageIds.length > 0) docData.image_ids = imageIds;
    if (videoId) docData.video_id = videoId;
    if (typeof body.theme === 'string' && body.theme) docData.theme = body.theme;
    if (typeof body.image_filter === 'string' && body.image_filter) docData.image_filter = body.image_filter;
    if (typeof body.feeling === 'string' && body.feeling) docData.feeling = body.feeling;
    if (typeof body.location === 'string' && body.location) docData.location = body.location;
    if (docData.is_locked) {
      const rawPrice = Number(body.unlock_price ?? CREDIT_LIMITS.lockPostMin);
      const clampedPrice = Number.isFinite(rawPrice)
        ? Math.min(CREDIT_LIMITS.lockPostMax, Math.max(CREDIT_LIMITS.lockPostMin, Math.round(rawPrice)))
        : CREDIT_LIMITS.lockPostMin;
      docData.unlock_price = clampedPrice;
    } else if (typeof body.unlock_price === 'number' && Number.isFinite(body.unlock_price)) {
      docData.unlock_price = body.unlock_price;
    }
    if (typeof body.poll === 'string' && body.poll) docData.poll = body.poll;
    if (typeof body.shared_post_data === 'string' && body.shared_post_data) {
      docData.shared_post_data = body.shared_post_data;
    }

    const doc = await db.createDocument(DATABASE_ID, COL.POSTS, ID.unique(), docData);

    // Non-blocking background updates (post counter, share increment, notifications)
    const authorName = String(profileDoc?.name || profileDoc?.username || session.authUser.name || 'Someone');
    const authorUsername = String(profileDoc?.username || '');
    const authorAvatar = String(profileDoc?.avatar_id || profileDoc?.avatar || '');

    void (async () => {
      try {
        if (profileDoc) {
          await db.updateDocument(DATABASE_ID, COL.USERS, profileDoc.$id, {
            posts_count: Number(profileDoc.posts_count || 0) + 1,
          });
        }
      } catch {}

      if (typeof body.shared_post_id === 'string' && body.shared_post_id) {
        try {
          const orig = await db.getDocument(DATABASE_ID, COL.POSTS, body.shared_post_id);
          await db.updateDocument(DATABASE_ID, COL.POSTS, body.shared_post_id, {
            shares_count: Number(orig.shares_count || 0) + 1,
          });
        } catch {}
      }

      try {
        const followers = await db.listDocuments(DATABASE_ID, COL.FOLLOWS, [
          Query.equal('following_id', userId),
          Query.limit(50),
        ]);
        const label = authorUsername ? `${authorName || '@' + authorUsername}` : authorName;
        await Promise.allSettled(
          followers.documents
            .filter((f) => f.follower_id && f.follower_id !== userId)
            .map((f) =>
              safeNotify({
                user_id: f.follower_id,
                from_user_id: userId,
                from_user_name: authorName,
                from_user_avatar: authorAvatar,
                type: 'POST',
                title: 'New Post',
                content: `${label} published a new post`,
                post_id: doc.$id,
              })
            )
        );
      } catch {}

      if (taggedUsers.length > 0) {
        const label = authorUsername ? `${authorName || '@' + authorUsername}` : authorName;
        await Promise.allSettled(
          taggedUsers
            .filter((uid: string) => uid !== userId)
            .map((uid: string) =>
              safeNotify({
                user_id: uid,
                from_user_id: userId,
                from_user_name: authorName,
                from_user_avatar: authorAvatar,
                type: 'TAG',
                title: 'You were tagged',
                content: `${label} tagged you in a post`,
                post_id: doc.$id,
              })
            )
        );
      }
    })();

    return NextResponse.json({ ok: true, doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not publish post.' }, { status: 500 });
  }
}
