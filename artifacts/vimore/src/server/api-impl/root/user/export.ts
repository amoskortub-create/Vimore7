import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.authUser.$id;
    const db = getAdminDatabases();

    const [postsRes, bookmarksRes, followsRes, blockedRes, subsRes, withdrawalsRes, notificationsRes] =
      await Promise.allSettled([
        db.listDocuments(DATABASE_ID, COL.POSTS, [Query.equal('user_id', userId), Query.orderDesc('$createdAt'), Query.limit(100)]),
        db.listDocuments(DATABASE_ID, COL.BOOKMARKS, [Query.equal('user_id', userId), Query.limit(100)]),
        db.listDocuments(DATABASE_ID, COL.FOLLOWS, [Query.equal('follower_id', userId), Query.limit(200)]),
        db.listDocuments(DATABASE_ID, COL.BLOCKED_USERS, [Query.equal('blocker_id', userId), Query.limit(100)]),
        db.listDocuments(DATABASE_ID, COL.SUBSCRIPTIONS, [Query.equal('subscriber_id', userId), Query.limit(100)]),
        db.listDocuments(DATABASE_ID, COL.WITHDRAWAL_REQUESTS, [Query.equal('user_id', userId), Query.orderDesc('$createdAt'), Query.limit(100)]),
        db.listDocuments(DATABASE_ID, COL.NOTIFICATIONS, [Query.equal('user_id', userId), Query.orderDesc('$createdAt'), Query.limit(100)]),
      ]);

    const { biometric_pin_hash: _pin, security_answer: _secAns, push_token: _pushTok, ...safeProfile } =
      session.profileDoc || {};

    const archive = {
      exportedAt: new Date().toISOString(),
      platform: 'ViMore',
      account: {
        id: session.authUser.$id,
        email: session.authUser.email,
        emailVerification: session.authUser.emailVerification,
        createdAt: session.authUser.$createdAt,
        profile: safeProfile,
      },
      posts: postsRes.status === 'fulfilled' ? postsRes.value.documents : [],
      bookmarks: bookmarksRes.status === 'fulfilled' ? bookmarksRes.value.documents : [],
      following: followsRes.status === 'fulfilled' ? followsRes.value.documents : [],
      blockedUsers: blockedRes.status === 'fulfilled' ? blockedRes.value.documents : [],
      subscriptions: subsRes.status === 'fulfilled' ? subsRes.value.documents : [],
      withdrawals: withdrawalsRes.status === 'fulfilled' ? withdrawalsRes.value.documents : [],
      notifications: notificationsRes.status === 'fulfilled' ? notificationsRes.value.documents : [],
    };

    return new NextResponse(JSON.stringify(archive, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="vimore-data-${safeProfile.username || userId}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to export data' }, { status: 500 });
  }
}
