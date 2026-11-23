import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.CREATOR_EARNINGS, [
      Query.equal('user_id', session.authUser.$id),
      Query.limit(1),
    ]);
    const doc = res.documents[0];

    return NextResponse.json({
      earnings: {
        totalEarningsLD: Number(doc?.total_earnings_ld || 0),
        giftsEarningsLD: Number(doc?.gifts_earnings_ld || 0),
        subscriptionsEarningsLD: Number(doc?.subscriptions_earnings_ld || 0),
        lockedPostsEarningsLD: Number(doc?.locked_posts_earnings_ld || 0),
        lockedMusicEarningsLD: Number(doc?.locked_music_earnings_ld || 0),
        lastUpdated: doc?.last_updated || doc?.$updatedAt || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      earnings: {
        totalEarningsLD: 0,
        giftsEarningsLD: 0,
        subscriptionsEarningsLD: 0,
        lockedPostsEarningsLD: 0,
        lockedMusicEarningsLD: 0,
      },
      error: err?.message,
    });
  }
}
