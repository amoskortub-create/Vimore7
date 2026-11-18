import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import {
  MIN_WITHDRAW_CREDITS,
  roundCredits,
  WITHDRAW_RATE_LD,
  WITHDRAW_RATE_USD,
} from '@/lib/credit-monetization';

const WITHDRAW_REQUESTS = 'withdraw_requests';
const WITHDRAW_LOCKS = 'withdrawal_locks';
const ADMIN_ROLES = new Set(['SUPER', 'MODERATOR', 'FINANCIAL']);

async function acquireLock(db: ReturnType<typeof getAdminDatabases>, userId: string) {
  const existingLocks = await db.listDocuments(DATABASE_ID, WITHDRAW_LOCKS, [
    Query.equal('userId', userId),
    Query.limit(1),
  ]);
  const existingLock = existingLocks.documents[0];
  if (existingLock) {
    if (new Date(existingLock.expiresAt).getTime() > Date.now()) return false;
    try {
      await db.deleteDocument(DATABASE_ID, WITHDRAW_LOCKS, existingLock.$id);
    } catch (error: any) {
      if (error?.code !== 404) throw error;
    }
  }
  const lockId = ID.unique();
  try {
    await db.createDocument(DATABASE_ID, WITHDRAW_LOCKS, lockId, {
      userId,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    return lockId;
  } catch (error: any) {
    if (error?.code === 409) return false;
    throw error;
  }
}

async function releaseLock(db: ReturnType<typeof getAdminDatabases>, lockId: string) {
  try {
    await db.deleteDocument(DATABASE_ID, WITHDRAW_LOCKS, lockId);
  } catch (error) {
    console.error('[withdraw] failed to release user lock', error);
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  const db = getAdminDatabases();
  const isAdmin = ADMIN_ROLES.has(session.role ?? '');
  const result = await db.listDocuments(DATABASE_ID, WITHDRAW_REQUESTS, [
    ...(isAdmin ? [] : [Query.equal('userId', session.userId)]),
    Query.orderDesc('$createdAt'),
    Query.limit(200),
  ]);
  const requests = result.documents.map((doc: any) => isAdmin ? doc : ({
    $id: doc.$id,
    amountCredits: doc.amountCredits,
    amountLD: doc.amountLD,
    amountUSD: doc.amountUSD,
    userName: doc.userName,
    method: doc.method,
    status: doc.status,
    reason: doc.reason,
    adminMessage: doc.adminMessage,
    accountLast4: String(doc.accountNumber || '').slice(-4),
    createdAt: doc.createdAt || doc.$createdAt,
  }));
  let creditBalance: number | undefined;
  if (!isAdmin) {
    const user = await db.getDocument(DATABASE_ID, 'users', session.userId);
    creditBalance = Number(user.credit_balance ?? user.diamond_balance ?? 0);
  }
  return NextResponse.json({ requests, creditBalance });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'You must be logged in to withdraw.' }, { status: 401 });
  const rl = rateLimit(`credit-withdraw:${session.userId}`, 5, 60 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many withdrawal requests. Please try again later.' }, { status: 429 });

  const body = await req.json();
  const amountCredits = Number(body.amountCredits);
  const method = body.method;
  const accountName = String(body.accountName || '').trim();
  const accountNumber = String(body.accountNumber || '').trim();
  if (!Number.isFinite(amountCredits) || amountCredits < MIN_WITHDRAW_CREDITS) {
    return NextResponse.json({ error: `Minimum withdraw is ${MIN_WITHDRAW_CREDITS} Credits.` }, { status: 400 });
  }
  if (!['MTN MoMo', 'Orange Money'].includes(method)) {
    return NextResponse.json({ error: 'Choose MTN MoMo or Orange Money.' }, { status: 400 });
  }
  if (!accountName || !accountNumber || accountName.length > 128 || accountNumber.length > 128) {
    return NextResponse.json({ error: 'Enter an account name and account number.' }, { status: 400 });
  }

  const db = getAdminDatabases();
  const lockId = await acquireLock(db, session.userId);
  if (!lockId) {
    return NextResponse.json({ error: 'A withdrawal request is already being processed. Please try again.' }, { status: 409 });
  }

  try {
    const user = await db.getDocument(DATABASE_ID, 'users', session.userId);
    const balance = Number(user.credit_balance ?? user.diamond_balance ?? 0);
    if (!Number.isFinite(balance) || balance < amountCredits) {
      return NextResponse.json({ error: 'Insufficient Credits.' }, { status: 400 });
    }

    const amount = roundCredits(amountCredits);
    const newBalance = roundCredits(balance - amount);
    const amountLD = roundCredits(amount * WITHDRAW_RATE_LD);
    const amountUSD = roundCredits(amount * WITHDRAW_RATE_USD);
    await db.updateDocument(DATABASE_ID, 'users', session.userId, {
      credit_balance: newBalance,
      diamond_balance: newBalance,
    });

    try {
      const request = await db.createDocument(DATABASE_ID, WITHDRAW_REQUESTS, ID.unique(), {
        userId: session.userId,
        userName: user.name || user.username || '',
        username: user.username || '',
        amountCredits: amount,
        amountLD,
        amountUSD,
        method,
        accountName,
        accountNumber,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, requestId: request.$id, newBalance });
    } catch (error) {
      await db.updateDocument(DATABASE_ID, 'users', session.userId, {
        credit_balance: balance,
        diamond_balance: balance,
      });
      throw error;
    }
  } catch (error: any) {
    console.error('[withdraw] request failed', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Withdrawal request failed.' }, { status: 500 });
  } finally {
    await releaseLock(db, lockId);
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_ROLES.has(session.role ?? '')) return NextResponse.json({ error: 'Admin role required.' }, { status: 403 });

  const { requestId, action, reason, message, proofImageUrl } = await req.json();
  if (!requestId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'requestId and a valid action are required.' }, { status: 400 });
  }
  if (action === 'reject' && !String(reason || '').trim()) {
    return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
  }
  if (typeof message === 'string' && message.length > 512) {
    return NextResponse.json({ error: 'Admin message is too long.' }, { status: 400 });
  }
  if (typeof proofImageUrl === 'string' && proofImageUrl.length > 512) {
    return NextResponse.json({ error: 'Proof URL is too long.' }, { status: 400 });
  }

  const db = getAdminDatabases();
  let request: any;
  try {
    request = await db.getDocument(DATABASE_ID, WITHDRAW_REQUESTS, requestId);
  } catch {
    return NextResponse.json({ error: 'Withdrawal request not found.' }, { status: 404 });
  }
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'This withdrawal request has already been reviewed.' }, { status: 409 });
  }
  const userId = String(request.userId || '');
  if (!userId) {
    return NextResponse.json({ error: 'This user has another balance update in progress.' }, { status: 409 });
  }
  const lockId = await acquireLock(db, userId);
  if (!lockId) {
    return NextResponse.json({ error: 'This user has another balance update in progress.' }, { status: 409 });
  }

  try {
    request = await db.getDocument(DATABASE_ID, WITHDRAW_REQUESTS, requestId);
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'This withdrawal request has already been reviewed.' }, { status: 409 });
    }
    if (action === 'reject') {
      const user = await db.getDocument(DATABASE_ID, 'users', userId);
      const balance = Number(user.credit_balance ?? user.diamond_balance ?? 0);
      const refundedBalance = roundCredits(balance + Number(request.amountCredits || 0));
      await db.updateDocument(DATABASE_ID, 'users', userId, {
        credit_balance: refundedBalance,
        diamond_balance: refundedBalance,
      });
      try {
        await db.updateDocument(DATABASE_ID, WITHDRAW_REQUESTS, requestId, {
          status: 'rejected',
          reason: String(reason).trim().slice(0, 512),
          reviewedBy: session.userId,
          reviewedAt: new Date().toISOString(),
        });
      } catch (error) {
        await db.updateDocument(DATABASE_ID, 'users', userId, {
          credit_balance: balance,
          diamond_balance: balance,
        });
        throw error;
      }
    } else {
      const approvalUpdate: Record<string, string> = {
        status: 'paid',
        reviewedBy: session.userId,
        reviewedAt: new Date().toISOString(),
      };
      if (typeof message === 'string' && message.trim()) approvalUpdate.adminMessage = message.trim();
      if (typeof proofImageUrl === 'string' && proofImageUrl.trim()) approvalUpdate.proofImageUrl = proofImageUrl.trim();
      await db.updateDocument(DATABASE_ID, WITHDRAW_REQUESTS, requestId, approvalUpdate);
    }

    try {
      const status = action === 'approve' ? 'approved and paid' : 'rejected';
      const message = action === 'approve'
        ? `Your withdrawal of ${request.amountCredits} Credits was approved and paid to ${request.method} account ending in ${String(request.accountNumber || '').slice(-4)}.`
        : `Your withdrawal of ${request.amountCredits} Credits was rejected. ${String(reason).trim()}`;
      await db.createDocument(DATABASE_ID, 'notifications', ID.unique(), {
        user_id: userId,
        type: 'SYSTEM',
        title: `Withdrawal ${status}`,
        message,
        content: message,
        is_read: false,
      });
    } catch (error) {
      console.error('[withdraw] status notification failed', error);
    }
    return NextResponse.json({ ok: true, status: action === 'approve' ? 'paid' : 'rejected' });
  } catch (error: any) {
    console.error('[withdraw] admin review failed', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Could not review withdrawal.' }, { status: 500 });
  } finally {
    await releaseLock(db, lockId);
  }
}
