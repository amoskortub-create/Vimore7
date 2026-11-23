import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { calculatePlatformFee } from '@/lib/transaction-fee';
import { getAuthenticatedProfile, getUserBalance, safeNotify } from '@/lib/server-helpers';

const DEFAULT_SUBSCRIPTION_PRICE = 50;

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const creatorId = String(body.creatorId || '').trim();
    if (!creatorId) {
      return NextResponse.json({ error: 'creatorId required' }, { status: 400 });
    }
    if (creatorId === session.authUser.$id) {
      return NextResponse.json({ error: 'Cannot subscribe to yourself' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const creator = await db.getDocument(DATABASE_ID, COL.USERS, creatorId);
    const price = Math.max(
      1,
      Math.floor(Number(creator.subscription_price || DEFAULT_SUBSCRIPTION_PRICE))
    );

    const subscriberBalance = getUserBalance(session.profileDoc);
    if (subscriberBalance < price) {
      return NextResponse.json({ error: 'Insufficient Credits for subscription' }, { status: 400 });
    }

    const platformFee = calculatePlatformFee(price);
    const creatorShare = Math.max(0, price - platformFee);

    const subscriberNewBalance = subscriberBalance - price;
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      credit_balance: subscriberNewBalance,
      diamond_balance: subscriberNewBalance,
    });

    const creatorNewBalance = getUserBalance(creator) + creatorShare;
    await db.updateDocument(DATABASE_ID, COL.USERS, creatorId, {
      credit_balance: creatorNewBalance,
      diamond_balance: creatorNewBalance,
    });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.createDocument(DATABASE_ID, COL.SUBSCRIPTIONS, ID.unique(), {
      subscriber_id: session.authUser.$id,
      creator_id: creatorId,
      price,
      status: 'ACTIVE',
      expires_at: expiresAt,
    }).catch(() => {});

    await safeNotify({
      user_id: creatorId,
      from_user_id: session.authUser.$id,
      from_user_name: session.profileDoc.name || session.profileDoc.username,
      from_user_avatar: session.profileDoc.avatar || '',
      type: 'SUBSCRIPTION',
      title: 'New Creator Subscriber',
      content: `${session.profileDoc.name || session.profileDoc.username} subscribed to you (${creatorShare} Credits earned).`,
      action_href: '/earnings',
    });

    return NextResponse.json({
      ok: true,
      subscriberNewBalance,
      creatorShare,
      platformFee,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Subscription failed' }, { status: 500 });
  }
}
