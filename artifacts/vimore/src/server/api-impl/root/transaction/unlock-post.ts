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
    const postId = String(body.postId || '').trim();
    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const post = await db.getDocument(DATABASE_ID, COL.POSTS, postId);
    const price = Math.max(0, roundCredits(Number(post.unlock_price || 0)));
    const buyerBalance = getUserBalance(session.profileDoc);

    if (post.user_id === session.authUser.$id || price === 0) {
      return NextResponse.json({ ok: true, unlocked: true, newBalance: buyerBalance });
    }

    const existing = await db.listDocuments(DATABASE_ID, COL.POST_UNLOCKS, [
      Query.equal('post_id', postId),
      Query.equal('user_id', session.authUser.$id),
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
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      diamond_balance: newBalance,
      credit_balance: newBalance,
    });

    if (post.user_id) {
      try {
        const creator = await db.getDocument(DATABASE_ID, COL.USERS, post.user_id);
        const creatorBalance = roundCredits(getUserBalance(creator) + creatorShare);
        await db.updateDocument(DATABASE_ID, COL.USERS, post.user_id, {
          diamond_balance: creatorBalance,
          credit_balance: creatorBalance,
        });
      } catch (creatorErr) {
        await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
          diamond_balance: buyerBalance,
          credit_balance: buyerBalance,
        }).catch(() => {});
        throw creatorErr;
      }
    }

    await db.createDocument(DATABASE_ID, COL.POST_UNLOCKS, ID.unique(), {
      post_id: postId,
      user_id: session.authUser.$id,
    });

    const txId = ID.unique();
    const buyerName = String(session.profileDoc.name || session.profileDoc.username || '');
    const buyerAvatar = String(session.profileDoc.avatar_id || session.profileDoc.avatar || '');

    await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, txId, {
      user_id: session.authUser.$id,
      from_user_id: session.authUser.$id,
      to_user_id: String(post.user_id || ''),
      from_user_name: buyerName,
      from_user_avatar: buyerAvatar,
      type: 'POST_UNLOCK',
      amount: price,
      amountCredits: price,
      currency: 'DIAMOND',
      description: `Locked post unlocked · ${creatorShare} Credits to creator, ${platformFee} Credits platform fee`,
      reference_id: postId,
      status: 'COMPLETED',
      transactionId: txId,
      senderUserId: session.authUser.$id,
      receiverUserId: String(post.user_id || ''),
      buyerId: session.authUser.$id,
      transactionType: 'post_unlock',
      itemId: postId,
      itemType: 'post_unlock',
      createdAt: new Date().toISOString(),
    });

    if (post.user_id) {
      await safeNotify({
        user_id: post.user_id,
        from_user_id: session.authUser.$id,
        from_user_name: buyerName,
        from_user_avatar: buyerAvatar,
        type: 'UNLOCK',
        title: 'Content Unlocked',
        content: `${buyerName} unlocked your post (+${creatorShare} Credits after 20% platform fee).`,
        post_id: postId,
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
    return NextResponse.json({ error: err?.message || 'Unlock post failed' }, { status: 500 });
  }
}
