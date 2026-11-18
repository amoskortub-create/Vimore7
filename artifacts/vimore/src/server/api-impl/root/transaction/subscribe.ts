import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { ID, Query } from 'node-appwrite';
import { logSecurityEvent, extractRequestMeta } from '@/lib/security-logger';
import {
  calculateSplit,
  normalizeLegacySubscriptionCredits,
  normalizeSubscriptionCredits,
  roundCredits,
} from '@/lib/credit-monetization';

export const maxDuration = 30;

const COL = {
  USERS: 'users',
  SUBSCRIPTIONS: 'subscriptions',
  TRANSACTIONS: 'transactions',
  NOTIFICATIONS: 'notifications',
};

export async function POST(req: NextRequest) {
  const meta = extractRequestMeta(req);
  try {
    const ip = meta.ip_address;
    const rl = rateLimit(`subscribe:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      void logSecurityEvent({ ...meta, event_type: 'RATE_LIMITED', severity: 'WARN', result: 'blocked', details: 'Subscribe rate limit exceeded' });
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const session = await getSessionUser(req);
    if (!session) {
      void logSecurityEvent({ ...meta, event_type: 'AUTH_FAILURE', severity: 'WARN', result: 'blocked', details: 'Unauthenticated subscribe attempt' });
      return NextResponse.json({ error: 'You must be logged in to subscribe.' }, { status: 401 });
    }

    const { creatorId } = await req.json();
    if (!creatorId) {
      return NextResponse.json({ error: 'creatorId is required.' }, { status: 400 });
    }
    if (creatorId === session.userId) {
      void logSecurityEvent({ ...meta, event_type: 'SUBSCRIBE_SELF', severity: 'WARN', user_id: session.userId, result: 'blocked', details: 'Attempted self-subscription' });
      return NextResponse.json({ error: 'Cannot subscribe to yourself.' }, { status: 400 });
    }

    const db = getAdminDatabases();

    // Check for existing active subscription (idempotent)
    const existingSubs = await db.listDocuments(DATABASE_ID, COL.SUBSCRIPTIONS, [
      Query.equal('subscriber_id', session.userId),
      Query.equal('creator_id', creatorId),
      Query.equal('status', 'ACTIVE'),
      Query.limit(1),
    ]);
    if (existingSubs.total > 0) {
      return NextResponse.json({ ok: true, alreadySubscribed: true });
    }

    // Read creator from server — includes their verified status and subscription price
    let creatorDoc: any;
    try {
      creatorDoc = await db.getDocument(DATABASE_ID, COL.USERS, creatorId);
    } catch {
      return NextResponse.json({ error: 'Creator not found.' }, { status: 404 });
    }

    const parsedCost = creatorDoc.subscription_price_credits != null
      ? normalizeSubscriptionCredits(creatorDoc.subscription_price_credits)
      : normalizeLegacySubscriptionCredits(creatorDoc.subscription_price ?? creatorDoc.subscriptionPrice);
    if (!Number.isFinite(parsedCost) || parsedCost <= 0) {
      return NextResponse.json({ error: 'Invalid subscription price.' }, { status: 400 });
    }
    const cost = roundCredits(parsedCost);

    // Server-side subscriber balance read
    let subscriberDoc: any;
    try {
      subscriberDoc = await db.getDocument(DATABASE_ID, COL.USERS, session.userId);
    } catch {
      return NextResponse.json({ error: 'Subscriber not found.' }, { status: 404 });
    }

    const subscriberBalance = Number(subscriberDoc.credit_balance ?? subscriberDoc.diamond_balance ?? 0);
    if (subscriberBalance < cost) {
      void logSecurityEvent({ ...meta, event_type: 'SUBSCRIBE_INSUFFICIENT_BALANCE', severity: 'WARN', user_id: session.userId, target_id: creatorId, amount: cost, currency: 'CREDIT', result: 'blocked', details: `Balance ${subscriberBalance} < cost ${cost}` });
      return NextResponse.json(
        { error: `Insufficient Credits - Buy Credits. You need ${cost} but have ${subscriberBalance}.` },
        { status: 402 }
      );
    }

    const { platformFeeCredits: platformFee, creatorEarningsCredits: creatorShare } = calculateSplit(cost);

    const subscriberNewBalance = roundCredits(subscriberBalance - cost);
    const creatorCurrentBalance = Number(creatorDoc.credit_balance ?? creatorDoc.diamond_balance ?? 0);
    const creatorNewBalance = roundCredits(creatorCurrentBalance + creatorShare);

    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();

    // Deduct subscriber first
    await db.updateDocument(DATABASE_ID, COL.USERS, session.userId, {
      credit_balance: subscriberNewBalance,
      diamond_balance: subscriberNewBalance,
    });

    try {
      await Promise.all([
        db.createDocument(DATABASE_ID, COL.SUBSCRIPTIONS, ID.unique(), {
          subscriber_id: session.userId,
          creator_id: creatorId,
          creator_username: creatorDoc.username || '',
          subscriber_username: subscriberDoc.username || '',
          price: cost,
          tier: 'STANDARD',
          expires_at: expiresAt,
          status: 'ACTIVE',
        }),
        db.updateDocument(DATABASE_ID, COL.USERS, creatorId, {
          credit_balance: creatorNewBalance,
          diamond_balance: creatorNewBalance,
        }),
        db.createDocument(DATABASE_ID, COL.TRANSACTIONS, ID.unique(), {
          user_id: session.userId,
          transactionId: ID.unique(),
          senderUserId: session.userId,
          receiverUserId: creatorId,
          transactionType: 'subscription',
          amountLD: Math.round(cost),
          amountCredits: cost,
          createdAt: new Date().toISOString(),
          type: 'SUBSCRIPTION',
          currency: 'CREDIT',
          amount: cost,
          description: `Subscribed to @${creatorDoc.username || creatorId}`,
          reference_id: creatorId,
          status: 'completed',
        }),
        db.createDocument(DATABASE_ID, COL.TRANSACTIONS, ID.unique(), {
          user_id: creatorId,
          transactionId: ID.unique(),
          senderUserId: session.userId,
          receiverUserId: creatorId,
          transactionType: 'subscription',
          amountLD: Math.round(creatorShare),
          amountCredits: creatorShare,
          createdAt: new Date().toISOString(),
          type: 'SUBSCRIPTION_EARNING',
          currency: 'CREDIT',
          amount: creatorShare,
          description: `Subscription from @${subscriberDoc.username || session.userId}`,
          reference_id: session.userId,
          status: 'completed',
          from_user_id: session.userId,
          from_user_name: subscriberDoc.username || subscriberDoc.name || '',
          from_user_avatar: subscriberDoc.avatar || '',
        }),
        db.createDocument(DATABASE_ID, 'platform_fees', ID.unique(), {
          buyerId: session.userId,
          creatorId,
          amountCredits: platformFee,
          purchaseType: 'subscription',
          createdAt: new Date().toISOString(),
        }),
        db.createDocument(DATABASE_ID, COL.NOTIFICATIONS, ID.unique(), {
          user_id: creatorId,
          from_user_id: session.userId,
          type: 'SUBSCRIPTION',
          title: 'New Subscriber!',
          content: `@${subscriberDoc.username || 'Someone'} subscribed to you.`,
          message: `@${subscriberDoc.username || 'Someone'} subscribed to you.`,
          is_read: false,
        }),
      ]);
    } catch (err) {
      // Best-effort rollback
      try {
        await db.updateDocument(DATABASE_ID, COL.USERS, session.userId, {
          credit_balance: subscriberBalance,
          diamond_balance: subscriberBalance,
        });
      } catch { /* rollback failed */ }
      void logSecurityEvent({ ...meta, event_type: 'SUBSCRIBE_FAILED', severity: 'ERROR', user_id: session.userId, target_id: creatorId, amount: cost, currency: 'CREDIT', result: 'failure', details: (err as any)?.message ?? 'Unknown error — subscriber rolled back' });
      throw err;
    }

    void logSecurityEvent({ ...meta, event_type: 'SUBSCRIPTION', severity: 'INFO', user_id: session.userId, target_id: creatorId, amount: cost, currency: 'CREDIT', result: 'success',     details: `Platform fee ${platformFee} Credits. Creator received ${creatorShare} Credits. Expires ${expiresAt}` });

    return NextResponse.json({
      ok: true,
      cost,
      subscriberNewBalance,
      creatorShare,
      platformFee,
      expiresAt,
    });
  } catch (err: any) {
    void logSecurityEvent({ ...meta, event_type: 'SUBSCRIBE_ERROR', severity: 'ERROR', result: 'failure', details: err?.message ?? 'Unhandled error' });
    return NextResponse.json({ error: err?.message || 'Subscription failed.' }, { status: 500 });
  }
}
