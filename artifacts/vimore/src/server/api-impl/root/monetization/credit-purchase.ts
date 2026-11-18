import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';
import { calculateSplit, normalizeLockedCredits, roundCredits } from '@/lib/credit-monetization';
import { GIFT_ITEMS } from '@/lib/ld-monetization';

const USERS = 'users';
const TRANSACTIONS = 'transactions';

type PurchaseType = 'gift' | 'locked_post' | 'locked_music';

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  try {
    const body = await req.json();
    const type = body.type as PurchaseType;
    if (!['gift', 'locked_post', 'locked_music'].includes(type)) {
      return NextResponse.json({ error: 'Unsupported Credit purchase.' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const buyer = await db.getDocument(DATABASE_ID, USERS, session.userId);
    let creatorId = String(body.creatorId || '');
    let credits: number;
    let referenceId = '';
    let contentLabel = '';

    if (type === 'gift') {
      const gift = GIFT_ITEMS.find(item => item.id === body.giftId);
      if (!gift) return NextResponse.json({ error: 'Choose a valid Gift.' }, { status: 400 });
      credits = gift.priceCredits;
      contentLabel = gift.name;
    } else if (type === 'locked_post') {
      referenceId = String(body.postId || '');
      if (!referenceId) return NextResponse.json({ error: 'postId is required.' }, { status: 400 });
      const post = await db.getDocument(DATABASE_ID, 'posts', referenceId);
      creatorId = String(post.user_id || '');
      if (post.credit_price != null && (!Number.isInteger(Number(post.credit_price)) || Number(post.credit_price) < 2 || Number(post.credit_price) > 10)) {
        return NextResponse.json({ error: 'Locked post price must be 2 to 10 Credits.' }, { status: 400 });
      }
      credits = post.credit_price != null ? Number(post.credit_price) : normalizeLockedCredits(post.unlock_price);
      contentLabel = 'Locked post unlock';
      if (!post.is_locked) return NextResponse.json({ error: 'This post is not locked.' }, { status: 409 });
    } else {
      referenceId = String(body.contentId || '');
      if (!referenceId) return NextResponse.json({ error: 'contentId is required.' }, { status: 400 });
      const contentCollection = body.contentType === 'album' ? 'albums' : 'tracks';
      const content = await db.getDocument(DATABASE_ID, contentCollection, referenceId);
      creatorId = String(content.user_id || content.artist_id || '');
      if (content.credit_price != null && (!Number.isInteger(Number(content.credit_price)) || Number(content.credit_price) < 2 || Number(content.credit_price) > 10)) {
        return NextResponse.json({ error: 'Locked music price must be 2 to 10 Credits.' }, { status: 400 });
      }
      credits = content.credit_price != null ? Number(content.credit_price) : normalizeLockedCredits(content.unlock_price);
      contentLabel = 'Locked music unlock';
      if (!content.is_locked) return NextResponse.json({ error: 'This music is not locked.' }, { status: 409 });
    }

    if (!creatorId || creatorId === session.userId) {
      return NextResponse.json({ error: 'A valid creator is required.' }, { status: 400 });
    }
    if (type === 'gift' && (!Number.isFinite(credits) || credits <= 0)) {
      return NextResponse.json({ error: 'Gift price must be positive.' }, { status: 400 });
    }

    const priorUnlockCollection = type === 'locked_post' ? 'post_unlocks' : type === 'locked_music' ? 'music_unlocks' : '';
    if (priorUnlockCollection) {
      const key = type === 'locked_post' ? 'post_id' : 'track_id';
      const existing = await db.listDocuments(DATABASE_ID, priorUnlockCollection, [
        Query.equal('user_id', session.userId),
        Query.equal(key, referenceId),
        Query.limit(1),
      ]);
      if (existing.total) return NextResponse.json({ ok: true, alreadyUnlocked: true });
    }

    const creator = await db.getDocument(DATABASE_ID, USERS, creatorId);
    const buyerBalance = Number(buyer.credit_balance ?? buyer.diamond_balance ?? 0);
    if (!Number.isFinite(buyerBalance) || buyerBalance < credits) {
      return NextResponse.json({
        error: 'Insufficient Credits - Buy Credits',
        insufficientCredits: true,
        required: credits,
        available: Number.isFinite(buyerBalance) ? buyerBalance : 0,
      }, { status: 402 });
    }

    const split = calculateSplit(credits);
    const creatorBalance = Number(creator.credit_balance ?? creator.diamond_balance ?? 0);
    const buyerNewBalance = roundCredits(buyerBalance - credits);
    const creatorNewBalance = roundCredits(creatorBalance + split.creatorEarningsCredits);
    const now = new Date().toISOString();
    const transactionType = type === 'locked_post' ? 'unlock_post' : type === 'locked_music' ? 'unlock_music' : 'gift';
    const unlockDocument = type === 'locked_post'
      ? { user_id: session.userId, post_id: referenceId }
      : type === 'locked_music'
        ? { user_id: session.userId, track_id: referenceId, artist_id: creatorId, price_paid: credits, artist_amount: split.creatorEarningsCredits }
        : null;

    await db.updateDocument(DATABASE_ID, USERS, session.userId, {
      credit_balance: buyerNewBalance,
      diamond_balance: buyerNewBalance,
    });

    try {
      await db.updateDocument(DATABASE_ID, USERS, creatorId, {
        credit_balance: creatorNewBalance,
        diamond_balance: creatorNewBalance,
      });

      if (unlockDocument) {
        await db.createDocument(DATABASE_ID, priorUnlockCollection, ID.unique(), unlockDocument as any);
      }

      await Promise.all([
        db.createDocument(DATABASE_ID, TRANSACTIONS, ID.unique(), {
          user_id: creatorId,
          transactionId: ID.unique(),
          senderUserId: session.userId,
          receiverUserId: creatorId,
          transactionType,
          amountLD: Math.round(split.creatorEarningsCredits),
          amountCredits: split.creatorEarningsCredits,
          currency: 'CREDIT',
          itemId: referenceId || session.userId,
          itemType: type === 'gift' ? 'gift_item' : type === 'locked_post' ? 'post' : 'music',
          createdAt: now,
          status: 'completed',
          description: `${contentLabel} earned`,
        }),
        db.createDocument(DATABASE_ID, 'platform_fees', ID.unique(), {
          buyerId: session.userId,
          creatorId,
          amountCredits: split.platformFeeCredits,
          purchaseType: transactionType,
          createdAt: now,
        }),
      ]);
    } catch (error) {
      try {
        await db.updateDocument(DATABASE_ID, USERS, session.userId, {
          credit_balance: buyerBalance,
          diamond_balance: buyerBalance,
        });
      } catch (rollbackError) {
        console.error('[credit-purchase] buyer balance rollback failed', rollbackError);
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      credits,
      creatorEarningsCredits: split.creatorEarningsCredits,
      buyerNewBalance,
      creatorNewBalance,
    });
  } catch (error: any) {
    console.error('[credit-purchase] failed', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Credit purchase failed.' }, { status: 500 });
  }
}
