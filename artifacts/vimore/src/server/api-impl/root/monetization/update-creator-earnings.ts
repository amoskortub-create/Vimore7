import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const creatorUserId = String(body.creatorUserId || session.authUser.$id).trim();
    const transactionType = String(body.transactionType || 'gift');
    const amountLD = Math.max(0, Number(body.amountLD || 0));

    const db = getAdminDatabases();
    const existing = await db.listDocuments(DATABASE_ID, COL.CREATOR_EARNINGS, [
      Query.equal('user_id', creatorUserId),
      Query.limit(1),
    ]);

    const current = existing.documents[0];
    const now = new Date().toISOString();

    if (current) {
      const updates: Record<string, any> = {
        total_earnings_ld: Number(current.total_earnings_ld || 0) + amountLD,
        last_updated: now,
      };
      if (transactionType === 'gift') {
        updates.gifts_earnings_ld = Number(current.gifts_earnings_ld || 0) + amountLD;
      } else if (transactionType === 'subscription') {
        updates.subscriptions_earnings_ld =
          Number(current.subscriptions_earnings_ld || 0) + amountLD;
      } else if (transactionType === 'locked_post') {
        updates.locked_posts_earnings_ld = Number(current.locked_posts_earnings_ld || 0) + amountLD;
      } else if (transactionType === 'locked_music') {
        updates.locked_music_earnings_ld = Number(current.locked_music_earnings_ld || 0) + amountLD;
      }

      const updated = await db.updateDocument(
        DATABASE_ID,
        COL.CREATOR_EARNINGS,
        current.$id,
        updates
      );
      return NextResponse.json({ ok: true, earnings: updated });
    }

    const created = await db.createDocument(DATABASE_ID, COL.CREATOR_EARNINGS, ID.unique(), {
      user_id: creatorUserId,
      total_earnings_ld: amountLD,
      gifts_earnings_ld: transactionType === 'gift' ? amountLD : 0,
      subscriptions_earnings_ld: transactionType === 'subscription' ? amountLD : 0,
      locked_posts_earnings_ld: transactionType === 'locked_post' ? amountLD : 0,
      locked_music_earnings_ld: transactionType === 'locked_music' ? amountLD : 0,
      last_updated: now,
    });

    return NextResponse.json({ ok: true, earnings: created });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Earnings update failed' }, { status: 500 });
  }
}
