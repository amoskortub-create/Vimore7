import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { CREDIT_LIMITS } from '@/lib/credit-pricing';
import { roundCredits } from '@/lib/transaction-fee';
import { getAuthenticatedProfile, getUserBalance } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const currency = String(body.currency || 'DIAMOND').toUpperCase();
    const amount = roundCredits(Number(body.amount || 0));
    const rawMethod = String(body.method || '').trim().toUpperCase();
    const method =
      rawMethod.includes('MTN')
        ? 'MTN MoMo'
        : rawMethod.includes('ORANGE')
        ? 'Orange Money'
        : String(body.method || '').trim();
    const accountName = String(body.accountName || '').trim();
    const accountNumber = String(body.accountNumber || '').trim();

    if (!Number.isFinite(amount) || amount <= 0 || !accountName || !accountNumber) {
      return NextResponse.json(
        { error: 'Valid amount, accountName, and accountNumber are required' },
        { status: 400 }
      );
    }

    if (method !== 'Orange Money' && method !== 'MTN MoMo') {
      return NextResponse.json(
        { error: 'Please select Orange Money or MTN MoMo' },
        { status: 400 }
      );
    }

    const db = getAdminDatabases();
    let currentBalance = 0;
    const updates: Record<string, any> = {};
    const rollbackUpdates: Record<string, any> = {};

    if (currency === 'STAR') {
      currentBalance = roundCredits(Number(session.profileDoc.star_balance || 0));
      if (currentBalance < amount) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
      updates.star_balance = roundCredits(currentBalance - amount);
      rollbackUpdates.star_balance = currentBalance;
    } else if (currency === 'GOLD') {
      currentBalance = roundCredits(Number(session.profileDoc.gold_balance || 0));
      if (currentBalance < amount) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
      updates.gold_balance = roundCredits(currentBalance - amount);
      rollbackUpdates.gold_balance = currentBalance;
    } else {
      currentBalance = getUserBalance(session.profileDoc);
      if (currentBalance < amount) {
        return NextResponse.json({ error: 'Insufficient Credit balance' }, { status: 400 });
      }
      updates.diamond_balance = roundCredits(currentBalance - amount);
      rollbackUpdates.diamond_balance = currentBalance;
    }

    const newBalance = roundCredits(currentBalance - amount);
    const payoutAmount = roundCredits(amount * CREDIT_LIMITS.creditUsdRate);
    const payoutCurrency = 'USD';

    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, updates);

    try {
      const wd = await db.createDocument(DATABASE_ID, COL.WITHDRAWAL_REQUESTS, ID.unique(), {
        user_id: session.authUser.$id,
        username: String(session.profileDoc.username || ''),
        currency: 'DIAMOND',
        amount,
        payout_amount: payoutAmount,
        payout_currency: payoutCurrency,
        method,
        account_name: accountName,
        account_number: accountNumber,
        status: 'PENDING',
      });

      return NextResponse.json({
        ok: true,
        withdrawalId: wd.$id,
        newBalance,
        payoutAmount,
        payoutCurrency,
        method,
      });
    } catch (wdErr) {
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, rollbackUpdates).catch(() => {});
      throw wdErr;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Withdrawal failed' }, { status: 500 });
  }
}
