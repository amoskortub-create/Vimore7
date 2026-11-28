import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import { requireAdminUser, safeNotify, getUserBalance, logSecurityEvent, createAuditEntry, getClientIp } from '@/lib/server-helpers';

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
    const cost = Number(record.cost ?? record.amount ?? 0);
    const wasPending = String(record.status || '').toUpperCase() === 'PENDING';

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const nowIso = new Date().toISOString();

    await db.updateDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, recordId, {
      status: 'REJECTED',
      rejection_reason: reason,
      reviewed_by: adminUsername,
      reviewed_by_name: adminName,
      reviewed_at: nowIso,
    });

    if (userId && cost > 0 && wasPending) {
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

    await Promise.allSettled([
      ...(userId ? [
        safeNotify({
          user_id: userId,
          from_user_id: admin.authUser.$id,
          from_user_name: adminName,
          type: 'SYSTEM',
          title: 'Verification Rejected',
          content: `Your verification request was declined (${reason}). Any fee has been refunded.`,
        }),
      ] : []),
      logSecurityEvent({
        event_type: 'VERIFICATION_REJECTED',
        severity: 'WARN',
        user_id: userId || '',
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: recordId,
        result: 'success',
        endpoint: '/api/admin/verify-reject',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `Verification rejected for @${record.username || userId} by ${adminName} (@${adminUsername}): ${reason}`,
      }),
      createAuditEntry({
        action: 'VERIFICATION_REJECTED',
        details: `Verification rejected for @${record.username || userId}: ${reason}`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({ ok: true, status: 'REJECTED' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Rejection failed' }, { status: 500 });
  }
}
