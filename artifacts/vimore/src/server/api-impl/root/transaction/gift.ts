import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
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
    const recipientId = String(body.recipientId || '').trim();
    const amount = roundCredits(Number(body.amount || 0));
    const itemId = String(body.itemId || '').trim();
    const itemName = String(body.itemName || '').trim();

    if (!recipientId || amount <= 0) {
      return NextResponse.json({ error: 'Valid recipientId and positive Credit amount required' }, { status: 400 });
    }
    if (amount < CREDIT_LIMITS.giftMin || amount > CREDIT_LIMITS.giftMax) {
      return NextResponse.json(
        { error: `Gift amount must be between ${CREDIT_LIMITS.giftMin} and ${CREDIT_LIMITS.giftMax} Credits` },
        { status: 400 }
      );
    }
    if (recipientId === session.authUser.$id) {
      return NextResponse.json({ error: 'Cannot gift yourself' }, { status: 400 });
    }

    const senderBalance = getUserBalance(session.profileDoc);
    if (senderBalance < amount) {
      return NextResponse.json({ error: 'Insufficient Credits' }, { status: 400 });
    }

    const platformFee = calculatePlatformFee(amount);
    const creatorShare = calculateCreatorShare(amount);

    const db = getAdminDatabases();
    const recipientDoc = await db.getDocument(DATABASE_ID, COL.USERS, recipientId);

    const senderNewBalance = roundCredits(senderBalance - amount);
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      diamond_balance: senderNewBalance,
      credit_balance: senderNewBalance,
    });

    const recipientNewBalance = roundCredits(getUserBalance(recipientDoc) + creatorShare);
    try {
      await db.updateDocument(DATABASE_ID, COL.USERS, recipientId, {
        diamond_balance: recipientNewBalance,
        credit_balance: recipientNewBalance,
      });
    } catch (creditErr) {
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        diamond_balance: senderBalance,
        credit_balance: senderBalance,
      }).catch(() => {});
      throw creditErr;
    }

    const txId = ID.unique();
    const senderName = String(session.profileDoc.name || session.profileDoc.username || '');
    const senderAvatar = String(session.profileDoc.avatar_id || session.profileDoc.avatar || '');

    await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, txId, {
      user_id: session.authUser.$id,
      from_user_id: session.authUser.$id,
      to_user_id: recipientId,
      from_user_name: senderName,
      from_user_avatar: senderAvatar,
      type: 'GIFT_SENT',
      amount,
      amountCredits: amount,
      currency: 'DIAMOND',
      description: `${itemName ? `${itemName} gift` : 'Gift sent'} · ${creatorShare} Credits to creator, ${platformFee} Credits platform fee`,
      reference_id: itemId || txId,
      status: 'COMPLETED',
      transactionId: txId,
      senderUserId: session.authUser.$id,
      receiverUserId: recipientId,
      transactionType: 'gift',
      itemId: itemId || undefined,
      itemType: 'gift_item',
      createdAt: new Date().toISOString(),
    });

    await safeNotify({
      user_id: recipientId,
      from_user_id: session.authUser.$id,
      from_user_name: senderName,
      from_user_avatar: senderAvatar,
      type: 'GIFT',
      title: 'Gift Received',
      content: `${senderName} sent you ${itemName ? `${itemName} ` : ''}(+${creatorShare} Credits after 20% platform fee).`,
      action_href: '/earnings',
    });

    return NextResponse.json({
      ok: true,
      senderNewBalance,
      creatorShare,
      platformFee,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gift transaction failed' }, { status: 500 });
  }
}
