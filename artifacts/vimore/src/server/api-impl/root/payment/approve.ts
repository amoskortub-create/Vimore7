import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import { requireAdminUser, safeNotify, logSecurityEvent, createAuditEntry, getClientIp } from '@/lib/server-helpers';

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
    if (paymentReq.status === 'REJECTED') {
      return NextResponse.json({ error: 'Payment request was already rejected' }, { status: 409 });
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
          Number(userDoc.diamond_balance ?? userDoc.credit_balance ?? 0) + coinAmount;
        await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
          diamond_balance: nextCredits,
          credit_balance: nextCredits,
        });
      }
    }

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const nowIso = new Date().toISOString();

    await db.updateDocument(DATABASE_ID, COL.PAYMENT_REQUESTS, requestId, {
      status: 'APPROVED',
      reviewed_by: adminUsername,
      reviewed_by_id: admin.authUser.$id,
      reviewed_by_name: adminName,
      reviewed_at: nowIso,
    });

    if (userId) {
      await safeNotify({
        user_id: userId,
        from_user_id: admin.authUser.$id,
        from_user_name: adminName,
        type: 'SYSTEM',
        title: 'Payment Approved',
        content: `Your top-up of ${coinAmount} ${paymentReq.coin_type || 'Credits'} has been approved and added to your wallet.`,
        action_href: '/earnings',
      });
    }

    await Promise.allSettled([
      logSecurityEvent({
        event_type: 'PAYMENT_APPROVED',
        severity: 'INFO',
        user_id: userId,
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: requestId,
        amount: coinAmount,
        currency: coinType,
        result: 'success',
        endpoint: '/api/payment/approve',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `${adminName} (@${adminUsername}) approved payment #${requestId} for @${paymentReq.username || userId} (${coinAmount} ${paymentReq.coin_type || 'Credits'})`,
      }),
      createAuditEntry({
        action: 'PAYMENT_APPROVED',
        details: `Approved payment for @${paymentReq.username || userId}: ${coinAmount} ${paymentReq.coin_type || 'Credits'} ($${paymentReq.amount ?? 0} ${paymentReq.currency || 'USD'})`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Approval failed' }, { status: 500 });
  }
}
