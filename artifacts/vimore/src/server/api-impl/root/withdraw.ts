import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile, getUserBalance } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const currency = String(body.currency || 'DIAMOND').toUpperCase();
    const amount = Number(body.amount || 0);
    const method = String(body.method || 'MOBILE_MONEY').trim();
    const accountName = String(body.accountName || '').trim();
    const accountNumber = String(body.accountNumber || '').trim();
    const payoutAmount = Number(body.payoutAmount || 0);
    const payoutCurrency = String(body.payoutCurrency || 'USD').trim();
    const idempotencyKey = String(body.idempotencyKey || '').trim();

    if (!Number.isFinite(amount) || amount <= 0 || !accountName || !accountNumber) {
      return NextResponse.json(
        { error: 'Valid amount, accountName, and accountNumber are required' },
        { status: 400 }
      );
    }

    const db = getAdminDatabases();

    if (idempotencyKey) {
      try {
        const dup = await db.listDocuments(DATABASE_ID, COL.WITHDRAWAL_REQUESTS, [
          Query.equal('idempotency_key', idempotencyKey),
          Query.limit(1),
        ]);
        if (dup.documents[0]) {
          return NextResponse.json({
            ok: true,
            withdrawalId: dup.documents[0].$id,
            newBalance: getUserBalance(session.profileDoc),
          });
        }
      } catch {
        // ignore if idempotency_key attribute is not indexed
      }
    }

    let currentBalance = 0;
    const updates: Record<string, any> = {};

    if (currency === 'STAR') {
      currentBalance = Number(session.profileDoc.star_balance || 0);
      if (currentBalance < amount) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
      updates.star_balance = currentBalance - amount;
    } else if (currency === 'GOLD') {
      currentBalance = Number(session.profileDoc.gold_balance || 0);
      if (currentBalance < amount) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
      updates.gold_balance = currentBalance - amount;
    } else {
      currentBalance = getUserBalance(session.profileDoc);
      if (currentBalance < amount) {
        return NextResponse.json({ error: 'Insufficient Credit balance' }, { status: 400 });
      }
      const next = currentBalance - amount;
      updates.credit_balance = next;
      updates.diamond_balance = next;
    }

    const newBalance = currentBalance - amount;
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, updates);

    const wd = await db.createDocument(DATABASE_ID, COL.WITHDRAWAL_REQUESTS, ID.unique(), {
      user_id: session.authUser.$id,
      username: String(session.profileDoc.username || ''),
      currency,
      amount,
      payout_amount: payoutAmount,
      payout_currency: payoutCurrency,
      method,
      account_name: accountName,
      account_number: accountNumber,
      status: 'PENDING',
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    });

    return NextResponse.json({ ok: true, withdrawalId: wd.$id, newBalance });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Withdrawal failed' }, { status: 500 });
  }
}
