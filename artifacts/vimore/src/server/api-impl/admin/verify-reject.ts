import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { requireAdminUser, safeNotify, getUserBalance } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const recordId = String(body.recordId || '').trim();
    const reason = String(body.reason || 'Verification requirements not met.').trim();
    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const record: any = await db.getDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, recordId);
    const userId = record.user_id;
    const cost = Number(record.cost || 0);

    await db.updateDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, recordId, {
      status: 'REJECTED',
      rejection_reason: reason,
      reviewed_by: admin.authUser.$id,
      reviewed_at: new Date().toISOString(),
    });

    if (userId && cost > 0 && record.status === 'PENDING') {
      try {
        const userDoc: any = await db.getDocument(DATABASE_ID, COL.USERS, userId);
        const currency = String(record.currency || 'DIAMOND').toUpperCase();
        if (currency === 'STAR') {
          await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
            star_balance: Number(userDoc.star_balance || 0) + cost,
          });
        } else {
          const nextBal = getUserBalance(userDoc) + cost;
          await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
            diamond_balance: nextBal,
            credit_balance: nextBal,
          });
        }
      } catch {
        // non-fatal
      }
    }

    if (userId) {
      await safeNotify({
        user_id: userId,
        type: 'SYSTEM',
        title: 'Verification Rejected',
        content: `Your verification request was declined (${reason}). Any fee has been refunded.`,
      });
    }

    return NextResponse.json({ ok: true, status: 'REJECTED' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Rejection failed' }, { status: 500 });
  }
}
