import { NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases, getAdminUsers } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';

async function deleteAllMatching(
  db: ReturnType<typeof getAdminDatabases>,
  collectionId: string,
  queries: string[]
): Promise<number> {
  let totalDeleted = 0;
  for (let pass = 0; pass < 10; pass++) {
    try {
      const res = await db.listDocuments(DATABASE_ID, collectionId, [...queries, Query.limit(100)]);
      if (res.documents.length === 0) break;
      for (const doc of res.documents) {
        await db.deleteDocument(DATABASE_ID, collectionId, doc.$id).catch(() => {});
        totalDeleted += 1;
      }
      if (res.documents.length < 100) break;
    } catch {
      break;
    }
  }
  return totalDeleted;
}

export async function GET() {
  try {
    const db = getAdminDatabases();
    const adminUsers = getAdminUsers();
    const now = new Date().toISOString();
    let postBoosts = 0;
    let trackBoosts = 0;
    let verifications = 0;
    let campaigns = 0;
    let purgedUsers = 0;

    try {
      const expiredPosts = await db.listDocuments(DATABASE_ID, COL.POSTS, [
        Query.equal('is_boosted', true),
        Query.lessThan('boost_expiry', now),
        Query.limit(100),
      ]);
      for (const doc of expiredPosts.documents) {
        await db.updateDocument(DATABASE_ID, COL.POSTS, doc.$id, { is_boosted: false });
        postBoosts += 1;
      }
    } catch {
      // ignore index/schema mismatch
    }

    try {
      const expiredTracks = await db.listDocuments(DATABASE_ID, COL.TRACKS, [
        Query.equal('is_boosted', true),
        Query.lessThan('boost_expiry', now),
        Query.limit(100),
      ]);
      for (const doc of expiredTracks.documents) {
        await db.updateDocument(DATABASE_ID, COL.TRACKS, doc.$id, { is_boosted: false });
        trackBoosts += 1;
      }
    } catch {
      // ignore
    }

    try {
      const expiredUsers = await db.listDocuments(DATABASE_ID, COL.USERS, [
        Query.equal('is_verified', true),
        Query.lessThan('verification_expiry', now),
        Query.limit(100),
      ]);
      for (const doc of expiredUsers.documents) {
        await db.updateDocument(DATABASE_ID, COL.USERS, doc.$id, { is_verified: false });
        verifications += 1;
      }
    } catch {
      // ignore
    }

    try {
      const expiredAds = await db.listDocuments(DATABASE_ID, COL.AD_CAMPAIGNS, [
        Query.equal('is_active', true),
        Query.lessThan('expires_at', now),
        Query.limit(100),
      ]);
      for (const doc of expiredAds.documents) {
        await db.updateDocument(DATABASE_ID, COL.AD_CAMPAIGNS, doc.$id, {
          status: 'EXPIRED',
          is_active: false,
        });
        campaigns += 1;
      }
    } catch {
      // ignore
    }

    // 90-day permanent data deletion purge for deleted accounts
    try {
      const dueDeletions = await db.listDocuments(DATABASE_ID, COL.USERS, [
        Query.equal('is_deleted', true),
        Query.lessThan('scheduled_deletion_at', now),
        Query.limit(25),
      ]);

      for (const userDoc of dueDeletions.documents) {
        const uid = userDoc.$id;
        const uname = String(userDoc.username || '');

        await Promise.allSettled([
          deleteAllMatching(db, COL.POSTS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.POST_COMMENTS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.POST_REACTIONS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.POST_UNLOCKS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.BOOKMARKS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.STORIES, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.FOLLOWS, [Query.equal('follower_id', uid)]),
          deleteAllMatching(db, COL.FOLLOWS, [Query.equal('following_id', uid)]),
          deleteAllMatching(db, COL.FRIEND_REQUESTS, [Query.equal('from_user_id', uid)]),
          deleteAllMatching(db, COL.FRIEND_REQUESTS, [Query.equal('to_user_id', uid)]),
          deleteAllMatching(db, COL.BLOCKED_USERS, [Query.equal('blocker_id', uid)]),
          deleteAllMatching(db, COL.BLOCKED_USERS, [Query.equal('blocked_id', uid)]),
          deleteAllMatching(db, COL.MESSAGES, [Query.equal('sender_id', uid)]),
          deleteAllMatching(db, COL.NOTIFICATIONS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.SUBSCRIPTIONS, [Query.equal('subscriber_id', uid)]),
          deleteAllMatching(db, COL.TRACKS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.TRACK_LIKES, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.PLAYLISTS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.AD_CAMPAIGNS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.SUPPORT_TICKETS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.VERIFICATION_RECORDS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.WITHDRAWAL_REQUESTS, [Query.equal('user_id', uid)]),
          deleteAllMatching(db, COL.USER_ACTIVITY, [Query.equal('user_id', uid)]),
          ...(uname ? [deleteAllMatching(db, COL.SUBSCRIPTIONS, [Query.equal('creator_username', uname)])] : []),
        ]);

        await db.deleteDocument(DATABASE_ID, COL.USERS, uid).catch(() => {});
        await adminUsers.delete(uid).catch(() => {});
        purgedUsers += 1;
      }
    } catch {
      // ignore if index missing
    }

    return NextResponse.json({
      ok: true,
      reset: { postBoosts, trackBoosts, verifications, campaigns, purgedUsers },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Cleanup failed' }, { status: 500 });
  }
}
