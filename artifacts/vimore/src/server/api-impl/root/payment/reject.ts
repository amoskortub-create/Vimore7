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
    const reason = String(body.reason || 'Payment proof could not be verified.').trim();
    if (!requestId) {
      return NextResponse.json({ error: 'requestId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const paymentReq = await db.getDocument(DATABASE_ID, COL.PAYMENT_REQUESTS, requestId);
    if (paymentReq.status === 'APPROVED') {
      return NextResponse.json({ error: 'Cannot reject an already approved payment' }, { status: 409 });
    }
    if (paymentReq.status === 'REJECTED') {
      return NextResponse.json({ ok: true, alreadyRejected: true });
    }

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const nowIso = new Date().toISOString();

    await db.updateDocument(DATABASE_ID, COL.PAYMENT_REQUESTS, requestId, {
      status: 'REJECTED',
      rejection_reason: reason,
      reviewed_by: adminUsername,
      reviewed_by_id: admin.authUser.$id,
      reviewed_by_name: adminName,
      reviewed_at: nowIso,
    });

    if (paymentReq.user_id) {
      await safeNotify({
        user_id: paymentReq.user_id,
        from_user_id: admin.authUser.$id,
        from_user_name: adminName,
        type: 'SYSTEM',
        title: 'Payment Rejected',
        content: reason,
        action_href: '/earnings',
      });
    }

    await Promise.allSettled([
      logSecurityEvent({
        event_type: 'PAYMENT_REJECTED',
        severity: 'WARN',
        user_id: paymentReq.user_id || '',
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: requestId,
        amount: paymentReq.coin_amount || paymentReq.amount || 0,
        currency: String(paymentReq.coin_type || paymentReq.currency || 'USD'),
        result: 'success',
        endpoint: '/api/payment/reject',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `${adminName} (@${adminUsername}) rejected payment #${requestId} for @${paymentReq.username || paymentReq.user_id}: ${reason}`,
      }),
      createAuditEntry({
        action: 'PAYMENT_REJECTED',
        details: `Rejected payment for @${paymentReq.username || paymentReq.user_id}: ${reason}`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Rejection failed' }, { status: 500 });
  }
}
