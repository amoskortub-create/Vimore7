import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { CREDIT_PRICES } from '@/lib/credit-pricing';
import { roundCredits } from '@/lib/transaction-fee';
import { getAuthenticatedProfile, getUserBalance, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.profileDoc.is_verified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const body = await req.json().catch(() => ({}));
    const currency = String(body.currency || 'DIAMOND').toUpperCase();
    const isRenewal = Boolean(session.profileDoc.has_ever_been_verified);
    const cost = currency === 'STAR'
      ? (isRenewal ? 20000 : 25000)
      : CREDIT_PRICES.verification;

    const db = getAdminDatabases();
    const pending = await db.listDocuments(DATABASE_ID, COL.VERIFICATION_RECORDS, [
      Query.equal('user_id', session.authUser.$id),
      Query.equal('status', 'PENDING'),
      Query.limit(1),
    ]);
    if (pending.documents[0]) {
      return NextResponse.json({
        ok: true,
        status: 'PENDING',
        newBalance:
          currency === 'STAR'
            ? Number(session.profileDoc.star_balance || 0)
            : getUserBalance(session.profileDoc),
      });
    }

    let previousBalance = 0;
    let newBalance = 0;
    if (currency === 'STAR') {
      previousBalance = Number(session.profileDoc.star_balance || 0);
      if (previousBalance < cost) {
        return NextResponse.json({ error: 'Insufficient Star balance' }, { status: 400 });
      }
      newBalance = previousBalance - cost;
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        star_balance: newBalance,
      });
    } else {
      previousBalance = getUserBalance(session.profileDoc);
      if (previousBalance < cost) {
        return NextResponse.json({ error: `Insufficient Credit balance (${cost} Credits required)` }, { status: 400 });
      }
      newBalance = roundCredits(previousBalance - cost);
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        diamond_balance: newBalance,
        credit_balance: newBalance,
      });
    }

    try {
      await db.createDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, ID.unique(), {
        user_id: session.authUser.$id,
        username: String(session.profileDoc.username || ''),
        name: String(session.profileDoc.name || ''),
        currency,
        amount: cost,
        cost,
        status: 'PENDING',
        submitted_at: new Date().toISOString(),
      });
    } catch (recErr) {
      if (currency === 'STAR') {
        await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
          star_balance: previousBalance,
        }).catch(() => {});
      } else {
        await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
          diamond_balance: previousBalance,
          credit_balance: previousBalance,
        }).catch(() => {});
      }
      throw recErr;
    }

    await safeNotify({
      user_id: session.authUser.$id,
      type: 'SYSTEM',
      title: 'Verification Submitted',
      content: 'Your verification application is pending administrator review.',
      action_href: '/settings',
    });

    return NextResponse.json({ ok: true, status: 'PENDING', newBalance });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Verification failed' }, { status: 500 });
  }
}
