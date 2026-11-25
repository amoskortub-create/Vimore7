import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
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
    const targetId = String(body.trackId || body.itemId || '').trim();
    if (!targetId) {
      return NextResponse.json({ error: 'trackId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    let mediaDoc: any = null;
    try {
      mediaDoc = await db.getDocument(DATABASE_ID, COL.TRACKS, targetId);
    } catch {
      try {
        mediaDoc = await db.getDocument(DATABASE_ID, COL.ALBUMS, targetId);
      } catch {
        return NextResponse.json({ error: 'Music release not found' }, { status: 404 });
      }
    }

    const buyerId = session.authUser.$id;
    const artistId = String(mediaDoc.user_id || '');
    const price = Math.max(0, roundCredits(Number(mediaDoc.unlock_price || 0)));
    const buyerBalance = getUserBalance(session.profileDoc);

    if (artistId === buyerId || !mediaDoc.is_locked || price === 0) {
      return NextResponse.json({ ok: true, unlocked: true, newBalance: buyerBalance });
    }

    const existing = await db.listDocuments(DATABASE_ID, COL.MUSIC_UNLOCKS, [
      Query.equal('user_id', buyerId),
      Query.equal('track_id', targetId),
      Query.limit(1),
    ]);
    if (existing.documents[0]) {
      return NextResponse.json({ ok: true, unlocked: true, newBalance: buyerBalance });
    }

    if (buyerBalance < price) {
      return NextResponse.json({ error: 'Insufficient Credits' }, { status: 400 });
    }

    const platformFee = calculatePlatformFee(price);
    const creatorShare = calculateCreatorShare(price);
    const newBalance = roundCredits(buyerBalance - price);

    await db.updateDocument(DATABASE_ID, COL.USERS, buyerId, {
      diamond_balance: newBalance,
      credit_balance: newBalance,
    });

    if (artistId) {
      try {
        const artistDoc = await db.getDocument(DATABASE_ID, COL.USERS, artistId);
        const artistNewBal = roundCredits(getUserBalance(artistDoc) + creatorShare);
        await db.updateDocument(DATABASE_ID, COL.USERS, artistId, {
          diamond_balance: artistNewBal,
          credit_balance: artistNewBal,
        });
      } catch (artistErr) {
        await db.updateDocument(DATABASE_ID, COL.USERS, buyerId, {
          diamond_balance: buyerBalance,
          credit_balance: buyerBalance,
        }).catch(() => {});
        throw artistErr;
      }
    }

    await db.createDocument(DATABASE_ID, COL.MUSIC_UNLOCKS, ID.unique(), {
      user_id: buyerId,
      track_id: targetId,
      price_paid: price,
      artist_id: artistId,
      artist_amount: creatorShare,
    });

    const txId = ID.unique();
    const buyerName = String(session.profileDoc.name || session.profileDoc.username || '');
    const buyerAvatar = String(session.profileDoc.avatar_id || session.profileDoc.avatar || '');

    try {
      await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, txId, {
        user_id: buyerId,
        from_user_id: buyerId,
        to_user_id: artistId || 'platform',
        from_user_name: buyerName,
        from_user_avatar: buyerAvatar,
        type: 'TRACK_PURCHASE',
        amount: price,
        amountCredits: price,
        currency: 'DIAMOND',
        description: `Music unlock (${mediaDoc.title || targetId}) · ${creatorShare} Credits to artist, ${platformFee} Credits platform fee`,
        reference_id: targetId,
        status: 'COMPLETED',
        transactionId: txId,
        senderUserId: buyerId,
        receiverUserId: artistId || 'platform',
        buyerId,
        transactionType: 'unlock_music',
        itemId: targetId,
        itemType: 'music',
        createdAt: new Date().toISOString(),
      });
    } catch {
      // non-fatal
    }

    if (artistId) {
      await safeNotify({
        user_id: artistId,
        from_user_id: buyerId,
        from_user_name: buyerName,
        from_user_avatar: buyerAvatar,
        type: 'UNLOCK',
        title: 'Music Unlocked',
        content: `${buyerName} unlocked "${mediaDoc.title || 'your release'}" (+${creatorShare} Credits after 20% platform fee).`,
        action_href: '/earnings',
      });
    }

    return NextResponse.json({
      ok: true,
      unlocked: true,
      newBalance,
      creatorShare,
      platformFee,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unlock music failed' }, { status: 500 });
  }
}
