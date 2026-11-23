import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
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
    const postId = String(body.postId || '').trim();
    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const post = await db.getDocument(DATABASE_ID, COL.POSTS, postId);
    const price = Math.max(0, Math.floor(Number(post.unlock_price || 0)));

    if (post.user_id === session.authUser.$id || price === 0) {
      return NextResponse.json({ ok: true, unlocked: true });
    }

    const existing = await db.listDocuments(DATABASE_ID, COL.POST_UNLOCKS, [
      Query.equal('post_id', postId),
      Query.equal('user_id', session.authUser.$id),
      Query.limit(1),
    ]);
    if (existing.documents[0]) {
      return NextResponse.json({ ok: true, unlocked: true });
    }

    const buyerBalance = getUserBalance(session.profileDoc);
    if (buyerBalance < price) {
      return NextResponse.json({ error: 'Insufficient Credits' }, { status: 400 });
    }

    const platformFee = calculatePlatformFee(price);
    const creatorShare = Math.max(0, price - platformFee);

    const newBalance = buyerBalance - price;
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      credit_balance: newBalance,
      diamond_balance: newBalance,
    });

    if (post.user_id) {
      try {
        const creator = await db.getDocument(DATABASE_ID, COL.USERS, post.user_id);
        const creatorBalance = getUserBalance(creator) + creatorShare;
        await db.updateDocument(DATABASE_ID, COL.USERS, post.user_id, {
          credit_balance: creatorBalance,
          diamond_balance: creatorBalance,
        });
      } catch {
        // non-fatal
      }
    }

    await db.createDocument(DATABASE_ID, COL.POST_UNLOCKS, ID.unique(), {
      post_id: postId,
      user_id: session.authUser.$id,
      creator_id: post.user_id || '',
      amount: price,
    });

    if (post.user_id) {
      await safeNotify({
        user_id: post.user_id,
        from_user_id: session.authUser.$id,
        from_user_name: session.profileDoc.name || session.profileDoc.username,
        type: 'UNLOCK',
        title: 'Content Unlocked',
        content: `${session.profileDoc.name || session.profileDoc.username} unlocked your post (+${creatorShare} Credits).`,
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
