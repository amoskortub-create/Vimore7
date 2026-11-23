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
    const reason = String(body.reason || 'Payment proof could not be verified.').trim();
    if (!requestId) {
      return NextResponse.json({ error: 'requestId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const paymentReq = await db.getDocument(DATABASE_ID, COL.PAYMENT_REQUESTS, requestId);

    await db.updateDocument(DATABASE_ID, COL.PAYMENT_REQUESTS, requestId, {
      status: 'REJECTED',
      rejection_reason: reason,
      reviewed_by: admin.profileDoc.username || admin.authUser.$id,
      reviewed_at: new Date().toISOString(),
    });

    if (paymentReq.user_id) {
      await safeNotify({
        user_id: paymentReq.user_id,
        type: 'SYSTEM',
        title: 'Payment Rejected',
        content: reason,
        action_href: '/earnings',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Rejection failed' }, { status: 500 });
  }
}
