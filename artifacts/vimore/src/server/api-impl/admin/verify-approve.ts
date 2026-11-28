import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import { requireAdminUser, safeNotify, logSecurityEvent, createAuditEntry, getClientIp } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const recordId = String(body.recordId || '').trim();
    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const record: any = await db.getDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, recordId);
    const userId = record.user_id;
    if (!userId) {
      return NextResponse.json({ error: 'Invalid verification record' }, { status: 400 });
    }

    const expiryIso = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const nowIso = new Date().toISOString();

    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      is_verified: true,
      has_ever_been_verified: true,
      verification_expiry: expiryIso,
    });

    await db.updateDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, recordId, {
      status: 'APPROVED',
      reviewed_by: adminUsername,
      reviewed_by_name: adminName,
      reviewed_at: nowIso,
    });

    await Promise.allSettled([
      safeNotify({
        user_id: userId,
        from_user_id: admin.authUser.$id,
        from_user_name: adminName,
        type: 'SYSTEM',
        title: 'Verification Approved ✅',
        content: 'Congratulations! Your ViMore verified badge is now active.',
      }),
      logSecurityEvent({
        event_type: 'VERIFICATION_APPROVED',
        severity: 'INFO',
        user_id: userId,
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: recordId,
        result: 'success',
        endpoint: '/api/admin/verify-approve',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `Verification approved for @${record.username || userId} by ${adminName} (@${adminUsername})`,
      }),
      createAuditEntry({
        action: 'VERIFICATION_APPROVED',
        details: `Verification approved for @${record.username || userId}`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({ ok: true, status: 'APPROVED', verificationExpiry: expiryIso });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Approval failed' }, { status: 500 });
  }
}
