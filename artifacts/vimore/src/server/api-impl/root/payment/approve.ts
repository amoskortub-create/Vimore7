import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { requireAdminUser, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'FINANCIAL']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.requestId || '').trim();
    if (!requestId) {
      return NextResponse.json({ error: 'requestId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const paymentReq = await db.getDocument(DATABASE_ID, COL.PAYMENT_REQUESTS, requestId);
    if (paymentReq.status === 'APPROVED') {
      return NextResponse.json({ ok: true, alreadyApproved: true });
    }

    const userId = String(paymentReq.user_id || '');
    const coinType = String(paymentReq.coin_type || 'Credit').toUpperCase();
    const coinAmount = Math.max(0, Number(paymentReq.coin_amount || paymentReq.amount || 0));

    if (userId && coinAmount > 0) {
      const userDoc = await db.getDocument(DATABASE_ID, COL.USERS, userId);
      if (coinType === 'STAR') {
        await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
          star_balance: Number(userDoc.star_balance || 0) + coinAmount,
        });
      } else if (coinType === 'GOLD') {
        await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
          gold_balance: Number(userDoc.gold_balance || 0) + coinAmount,
        });
      } else {
        const nextCredits =
          Number(userDoc.credit_balance ?? userDoc.diamond_balance ?? 0) + coinAmount;
        await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
          credit_balance: nextCredits,
          diamond_balance: nextCredits,
        });
      }
    }

    await db.updateDocument(DATABASE_ID, COL.PAYMENT_REQUESTS, requestId, {
      status: 'APPROVED',
      reviewed_by: admin.profileDoc.username || admin.authUser.$id,
      reviewed_at: new Date().toISOString(),
    });

    if (userId) {
      await safeNotify({
        user_id: userId,
        type: 'SYSTEM',
        title: 'Payment Approved',
        content: `Your top-up of ${coinAmount} Credits has been approved and added to your wallet.`,
        action_href: '/earnings',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Approval failed' }, { status: 500 });
  }
}
