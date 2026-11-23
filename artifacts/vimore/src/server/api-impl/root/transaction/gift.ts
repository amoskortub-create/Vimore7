import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { calculatePlatformFee } from '@/lib/transaction-fee';
import { getAuthenticatedProfile, getUserBalance, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const recipientId = String(body.recipientId || '').trim();
    const amount = Math.floor(Number(body.amount || 0));

    if (!recipientId || amount <= 0) {
      return NextResponse.json({ error: 'Valid recipientId and positive amount required' }, { status: 400 });
    }
    if (recipientId === session.authUser.$id) {
      return NextResponse.json({ error: 'Cannot gift yourself' }, { status: 400 });
    }

    const senderBalance = getUserBalance(session.profileDoc);
    if (senderBalance < amount) {
      return NextResponse.json({ error: 'Insufficient Credits' }, { status: 400 });
    }

    const platformFee = calculatePlatformFee(amount);
    const creatorShare = Math.max(0, amount - platformFee);

    const db = getAdminDatabases();
    const recipientDoc = await db.getDocument(DATABASE_ID, COL.USERS, recipientId);

    const senderNewBalance = senderBalance - amount;
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      credit_balance: senderNewBalance,
      diamond_balance: senderNewBalance,
    });

    const recipientNewBalance = getUserBalance(recipientDoc) + creatorShare;
    await db.updateDocument(DATABASE_ID, COL.USERS, recipientId, {
      credit_balance: recipientNewBalance,
      diamond_balance: recipientNewBalance,
    });

    await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, ID.unique(), {
      sender_id: session.authUser.$id,
      receiver_id: recipientId,
      type: 'GIFT',
      amount,
      creator_share: creatorShare,
      platform_fee: platformFee,
      status: 'COMPLETED',
    }).catch(() => {});

    await safeNotify({
      user_id: recipientId,
      from_user_id: session.authUser.$id,
      from_user_name: session.profileDoc.name || session.profileDoc.username,
      from_user_avatar: session.profileDoc.avatar || '',
      type: 'GIFT',
      title: 'Gift Received',
      content: `${session.profileDoc.name || session.profileDoc.username} sent you ${creatorShare} Credits.`,
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
