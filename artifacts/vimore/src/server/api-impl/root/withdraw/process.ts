import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { roundCredits } from '@/lib/transaction-fee';
import { getUserBalance, requireAdminUser, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'FINANCIAL']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const status = String(body.status || '').toUpperCase();
    const adminMessage = body.adminMessage ? String(body.adminMessage).trim() : '';
    const proofImageUrl = body.proofImageUrl ? String(body.proofImageUrl).trim() : '';

    if (!id || (status !== 'APPROVED' && status !== 'REJECTED')) {
      return NextResponse.json({ error: 'Valid id and status (APPROVED | REJECTED) required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const wdDoc: any = await db.getDocument(DATABASE_ID, COL.WITHDRAWAL_REQUESTS, id);
    const currentStatus = String(wdDoc.status || '').toUpperCase();

    if (currentStatus !== 'PENDING') {
      return NextResponse.json({
        ok: true,
        alreadyProcessed: true,
        status: currentStatus,
      });
    }

    const wdUpdate: Record<string, any> = { status };
    if (adminMessage) {
      wdUpdate.admin_message = adminMessage;
    }

    await db.updateDocument(DATABASE_ID, COL.WITHDRAWAL_REQUESTS, id, wdUpdate);

    const amount = roundCredits(Number(wdDoc.amount || 0));
    const payoutAmount = Number(wdDoc.payout_amount || 0);
    const payoutCurrency = String(wdDoc.payout_currency || 'USD');

    if (status === 'REJECTED' && wdDoc.user_id && amount > 0) {
      try {
        const userDoc: any = await db.getDocument(DATABASE_ID, COL.USERS, wdDoc.user_id);
        const currency = String(wdDoc.currency || 'DIAMOND').toUpperCase();
        if (currency === 'STAR') {
          await db.updateDocument(DATABASE_ID, COL.USERS, wdDoc.user_id, {
            star_balance: roundCredits(Number(userDoc.star_balance || 0) + amount),
          });
        } else if (currency === 'GOLD') {
          await db.updateDocument(DATABASE_ID, COL.USERS, wdDoc.user_id, {
            gold_balance: roundCredits(Number(userDoc.gold_balance || 0) + amount),
          });
        } else {
          await db.updateDocument(DATABASE_ID, COL.USERS, wdDoc.user_id, {
            diamond_balance: roundCredits(getUserBalance(userDoc) + amount),
          });
        }
      } catch {
        // non-fatal if user doc was deleted
      }
    }

    if (wdDoc.user_id) {
      const baseMsg =
        status === 'APPROVED'
          ? `Your withdrawal of ${amount} Credits ($${payoutAmount.toFixed(2)} ${payoutCurrency}) via ${wdDoc.method || 'Mobile Money'} has been approved.`
          : `Your withdrawal of ${amount} Credits ($${payoutAmount.toFixed(2)} ${payoutCurrency}) was rejected and your Credits have been refunded.`;
      const details = [baseMsg, adminMessage, proofImageUrl ? `Receipt: ${proofImageUrl}` : '']
        .filter(Boolean)
        .join(' ');

      await safeNotify({
        user_id: wdDoc.user_id,
        from_user_id: admin.authUser.$id,
        from_user_name: admin.profileDoc.name || admin.profileDoc.username || 'ViMore Admin',
        type: 'SYSTEM',
        title: status === 'APPROVED' ? 'Withdrawal Approved' : 'Withdrawal Rejected',
        content: details,
        action_href: '/earnings',
      });
    }

    return NextResponse.json({ ok: true, status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Withdrawal processing failed' }, { status: 500 });
  }
}
