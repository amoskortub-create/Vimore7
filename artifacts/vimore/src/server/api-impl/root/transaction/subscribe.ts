import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { CREDIT_LIMITS } from '@/lib/credit-pricing';
import {
  calculateCreatorShare,
  calculatePlatformFee,
  roundCredits,
} from '@/lib/transaction-fee';
import { getAuthenticatedProfile, getUserBalance, safeNotify } from '@/lib/server-helpers';

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
    const price = CREDIT_LIMITS.subscriptionMonthly;
    const subscriberBalance = getUserBalance(session.profileDoc);

    const existing = await db.listDocuments(DATABASE_ID, COL.SUBSCRIPTIONS, [
      Query.equal('subscriber_id', session.authUser.$id),
      Query.equal('creator_id', creatorId),
      Query.equal('status', 'ACTIVE'),
      Query.limit(1),
    ]);
    if (existing.documents[0]) {
      const exp = existing.documents[0].expires_at
        ? new Date(existing.documents[0].expires_at).getTime()
        : Date.now() + 1;
      if (exp > Date.now()) {
        return NextResponse.json({
          ok: true,
          alreadySubscribed: true,
          subscriberNewBalance: subscriberBalance,
        });
      }
    }

    if (subscriberBalance < price) {
      return NextResponse.json({ error: `Insufficient Credits. Subscription costs ${price} Credits/month.` }, { status: 400 });
    }

    const platformFee = calculatePlatformFee(price);
    const creatorShare = calculateCreatorShare(price);

    const subscriberNewBalance = roundCredits(subscriberBalance - price);
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      diamond_balance: subscriberNewBalance,
      credit_balance: subscriberNewBalance,
    });

    const creatorNewBalance = roundCredits(getUserBalance(creator) + creatorShare);
    try {
      await db.updateDocument(DATABASE_ID, COL.USERS, creatorId, {
        diamond_balance: creatorNewBalance,
        credit_balance: creatorNewBalance,
      });
    } catch (creatorErr) {
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        diamond_balance: subscriberBalance,
        credit_balance: subscriberBalance,
      }).catch(() => {});
      throw creatorErr;
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const subId = ID.unique();

    await db.createDocument(DATABASE_ID, COL.SUBSCRIPTIONS, subId, {
      subscriber_id: session.authUser.$id,
      creator_id: creatorId,
      creator_username: String(creator.username || ''),
      subscriber_username: String(session.profileDoc.username || ''),
      price,
      amountLD: price,
      status: 'ACTIVE',
      expires_at: expiresAt,
      subscriptionId: subId,
      subscriberUserId: session.authUser.$id,
      creatorUserId: creatorId,
      startDate: nowIso,
      endDate: expiresAt,
      isActive: true,
      autoRenew: false,
    });

    const txId = ID.unique();
    const subscriberName = String(session.profileDoc.name || session.profileDoc.username || '');
    const subscriberAvatar = String(session.profileDoc.avatar_id || session.profileDoc.avatar || '');

    await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, txId, {
      user_id: session.authUser.$id,
      from_user_id: session.authUser.$id,
      to_user_id: creatorId,
      from_user_name: subscriberName,
      from_user_avatar: subscriberAvatar,
      type: 'SUBSCRIPTION',
      amount: price,
      amountCredits: price,
      currency: 'DIAMOND',
      description: `Monthly subscription to @${creator.username || creatorId} · ${creatorShare} Credits to creator, ${platformFee} Credits platform fee`,
      reference_id: subId,
      status: 'COMPLETED',
      transactionId: txId,
      senderUserId: session.authUser.$id,
      receiverUserId: creatorId,
      transactionType: 'subscription',
      itemId: creatorId,
      itemType: 'subscription',
      createdAt: nowIso,
    });

    await safeNotify({
      user_id: creatorId,
      from_user_id: session.authUser.$id,
      from_user_name: subscriberName,
      from_user_avatar: subscriberAvatar,
      type: 'SUBSCRIPTION',
      title: 'New Creator Subscriber',
      content: `${subscriberName} subscribed to you (+${creatorShare} Credits after 20% platform fee).`,
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
