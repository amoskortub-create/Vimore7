import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { calculateCreatorShare, roundCredits } from '@/lib/transaction-fee';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getAdminDatabases();
    const userId = session.authUser.$id;

    let giftsCredits = 0;
    let subscriptionsCredits = 0;
    let lockedPostsCredits = 0;
    let lockedMusicCredits = 0;
    let lastUpdated: string | null = null;

    const [txRes, musicRes] = await Promise.allSettled([
      db.listDocuments(DATABASE_ID, COL.TRANSACTIONS, [
        Query.equal('to_user_id', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(200),
      ]),
      db.listDocuments(DATABASE_ID, COL.MUSIC_UNLOCKS, [
        Query.equal('artist_id', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(200),
      ]),
    ]);

    if (txRes.status === 'fulfilled') {
      for (const tx of txRes.value.documents as any[]) {
        const rawAmount = Number(tx.amountCredits ?? tx.amount ?? 0);
        if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;
        const share = calculateCreatorShare(rawAmount);
        if (!lastUpdated && tx.$createdAt) lastUpdated = tx.$createdAt;

        if (tx.type === 'GIFT_SENT' || tx.transactionType === 'gift') {
          giftsCredits = roundCredits(giftsCredits + share);
        } else if (tx.type === 'POST_UNLOCK' || tx.transactionType === 'post_unlock') {
          lockedPostsCredits = roundCredits(lockedPostsCredits + share);
        } else if (tx.type === 'SUBSCRIPTION' || tx.transactionType === 'subscription') {
          subscriptionsCredits = roundCredits(subscriptionsCredits + share);
        }
      }
    }

    if (musicRes.status === 'fulfilled') {
      for (const m of musicRes.value.documents as any[]) {
        const share = roundCredits(Number(m.artist_amount || 0));
        if (share > 0) {
          lockedMusicCredits = roundCredits(lockedMusicCredits + share);
          if (!lastUpdated && m.$createdAt) lastUpdated = m.$createdAt;
        }
      }
    }

    const totalCredits = roundCredits(
      giftsCredits + subscriptionsCredits + lockedPostsCredits + lockedMusicCredits
    );

    return NextResponse.json({
      earnings: {
        totalCredits,
        giftsCredits,
        subscriptionsCredits,
        lockedPostsCredits,
        lockedMusicCredits,
        lastUpdated,
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      earnings: {
        totalCredits: 0,
        giftsCredits: 0,
        subscriptionsCredits: 0,
        lockedPostsCredits: 0,
        lockedMusicCredits: 0,
        lastUpdated: null,
      },
      error: err?.message,
    });
  }
}
