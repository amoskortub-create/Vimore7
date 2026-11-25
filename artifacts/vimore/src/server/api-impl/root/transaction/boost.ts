import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { CREDIT_PRICES } from '@/lib/credit-pricing';
import { roundCredits } from '@/lib/transaction-fee';
import { getAuthenticatedProfile, getUserBalance } from '@/lib/server-helpers';

type BoostKind = 'POST' | 'SONIC' | 'MARKETPLACE' | 'STORE';

const RATE_BY_KIND: Record<BoostKind, number> = {
  POST: CREDIT_PRICES.postBoostPerDay,
  SONIC: CREDIT_PRICES.musicBoostPerDay,
  MARKETPLACE: CREDIT_PRICES.marketplaceBoostPerDay,
  STORE: CREDIT_PRICES.storeBoostPerDay,
};

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawKind = String(body.type || 'POST').toUpperCase();
    if (!(['POST', 'SONIC', 'MARKETPLACE', 'STORE'] as const).includes(rawKind as BoostKind)) {
      return NextResponse.json({ error: 'Invalid boost type' }, { status: 400 });
    }
    const kind = rawKind as BoostKind;
    const targetId = String(body.targetId || body.nodeId || body.productId || body.storeId || '').trim();
    const rawDays = Number(body.days ?? body.duration ?? 1);
    const days = Number.isFinite(rawDays) ? Math.min(30, Math.max(1, Math.floor(rawDays))) : 0;

    if (!targetId || days < 1) {
      return NextResponse.json({ error: 'targetId and valid days (1-30) required' }, { status: 400 });
    }

    const ratePerDay = RATE_BY_KIND[kind];
    const cost = roundCredits(days * ratePerDay);
    const currentBalance = getUserBalance(session.profileDoc);

    if (currentBalance < cost) {
      return NextResponse.json(
        { error: `Insufficient Credits. You need ${cost} Credits, but have ${currentBalance}.` },
        { status: 400 }
      );
    }

    const db = getAdminDatabases();
    const userId = session.authUser.$id;
    let collectionId: string;
    let ownerField: string;

    if (kind === 'POST') {
      collectionId = COL.POSTS;
      ownerField = 'user_id';
    } else if (kind === 'SONIC') {
      collectionId = COL.TRACKS;
      ownerField = 'user_id';
    } else if (kind === 'MARKETPLACE') {
      collectionId = COL.PRODUCTS;
      ownerField = 'sellerId';
    } else {
      collectionId = COL.STORES;
      ownerField = 'owner_id';
    }

    const targetDoc: any = await db.getDocument(DATABASE_ID, collectionId, targetId);
    const ownerValue = String(targetDoc?.[ownerField] || '');
    if (ownerValue && ownerValue !== userId) {
      return NextResponse.json({ error: 'Forbidden: you can only boost your own content' }, { status: 403 });
    }

    const nowMs = Date.now();
    const existingIso = targetDoc.boost_expiry || targetDoc.featuredUntil || targetDoc.boost_until || null;
    const baseMs = existingIso && new Date(existingIso).getTime() > nowMs
      ? new Date(existingIso).getTime()
      : nowMs;
    const newExpiryIso = new Date(baseMs + days * 86_400_000).toISOString();

    const newBalance = roundCredits(currentBalance - cost);
    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      diamond_balance: newBalance,
      credit_balance: newBalance,
    });

    try {
      if (kind === 'POST') {
        await db.updateDocument(DATABASE_ID, COL.POSTS, targetId, {
          is_boosted: true,
          boost_expiry: newExpiryIso,
        });
      } else if (kind === 'SONIC') {
        await db.updateDocument(DATABASE_ID, COL.TRACKS, targetId, {
          is_boosted: true,
          boost_expiry: newExpiryIso,
        });
      } else if (kind === 'MARKETPLACE') {
        await db.updateDocument(DATABASE_ID, COL.PRODUCTS, targetId, {
          featuredUntil: newExpiryIso,
          boost_until: newExpiryIso,
        });
      } else {
        await db.updateDocument(DATABASE_ID, COL.STORES, targetId, {
          boost_until: newExpiryIso,
        });
      }
    } catch (targetErr) {
      await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
        diamond_balance: currentBalance,
        credit_balance: currentBalance,
      }).catch(() => {});
      throw targetErr;
    }

    const txId = ID.unique();
    const txTypeMap: Record<BoostKind, { type: string; transactionType: string; itemType: string }> = {
      POST: { type: 'POST_BOOST', transactionType: 'post_boost', itemType: 'post' },
      SONIC: { type: 'SONIC_BOOST', transactionType: 'sonic_boost', itemType: 'music' },
      MARKETPLACE: { type: 'MARKETPLACE_BOOST', transactionType: 'marketplace_boost', itemType: 'product' },
      STORE: { type: 'STORE_BOOST', transactionType: 'store_boost', itemType: 'store' },
    };
    const meta = txTypeMap[kind];

    try {
      await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, txId, {
        user_id: userId,
        from_user_id: userId,
        to_user_id: 'platform',
        from_user_name: String(session.profileDoc.name || session.profileDoc.username || ''),
        from_user_avatar: String(session.profileDoc.avatar_id || session.profileDoc.avatar || ''),
        type: meta.type,
        amount: cost,
        amountCredits: cost,
        currency: 'DIAMOND',
        description: `${kind} boost (${days} day${days > 1 ? 's' : ''} @ ${ratePerDay} Credits/day)`,
        reference_id: targetId,
        status: 'COMPLETED',
        transactionId: txId,
        senderUserId: userId,
        receiverUserId: 'platform',
        transactionType: meta.transactionType,
        itemId: targetId,
        itemType: meta.itemType,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // non-fatal transaction audit log failure
    }

    return NextResponse.json({
      ok: true,
      type: kind,
      days,
      cost,
      newBalance,
      boostExpiry: newExpiryIso,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Boost failed' }, { status: 500 });
  }
}
