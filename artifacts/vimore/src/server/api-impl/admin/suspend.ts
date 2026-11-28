import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import {
  requireAdminUser,
  logSecurityEvent,
  safeNotify,
  createAuditEntry,
  getFirstProtectedUserId,
  getClientIp,
} from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    const rawDays = Number(body.days ?? 1);
    const shouldLift = body.lift === true || rawDays === 0;
    const reason = String(body.reason || 'Policy violation').trim();
    const message = String(body.message || reason).trim();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    if (userId === admin.authUser.$id) {
      return NextResponse.json({ error: 'Cannot suspend your own account' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const nowIso = new Date().toISOString();

    if (shouldLift) {
      if (admin.role !== 'SUPER') {
        return NextResponse.json({ error: 'Only a Super Admin can restore access early' }, { status: 403 });
      }
      const targetDoc: any = await db.getDocument(DATABASE_ID, COL.USERS, userId);
      await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
        status: 'active',
        is_suspended: false,
        suspended_until: null,
        ban_reason: '',
      });
      try {
        const activeSuspensions = await db.listDocuments(DATABASE_ID, COL.USER_BANS, [
          Query.equal('user_id', userId),
          Query.limit(20),
        ]);
        await Promise.allSettled(
          activeSuspensions.documents
            .filter((d: any) => d.status !== 'RESTORED')
            .map((d: any) =>
              db.updateDocument(DATABASE_ID, COL.USER_BANS, d.$id, {
                status: 'RESTORED',
                restored_by: adminUsername,
                restored_by_name: adminName,
                restored_at: nowIso,
              })
            )
        );
      } catch {
        // non-fatal
      }

      await Promise.allSettled([
        safeNotify({
          user_id: userId,
          from_user_id: admin.authUser.$id,
          from_user_name: adminName,
          type: 'SYSTEM',
          title: 'Account Access Restored',
          content: 'Your account suspension has been lifted by a Super Administrator. Welcome back to ViMore.',
        }),
        logSecurityEvent({
          event_type: 'ADMIN_RESTORE_ACCESS',
          severity: 'INFO',
          user_id: userId,
          actor_id: admin.authUser.$id,
          actor_role: admin.role,
          target_id: userId,
          result: 'success',
          endpoint: '/api/admin/suspend',
          method: 'POST',
          ip_address: getClientIp(req),
          details: `Suspension lifted on @${targetDoc.username || userId} by ${adminName} (@${adminUsername})`,
        }),
        createAuditEntry({
          action: 'SUSPENSION_LIFTED',
          details: `Suspension lifted early on @${targetDoc.username || userId} by ${adminName} (@${adminUsername})`,
          performedBy: adminUsername,
          performedByName: adminName,
          performedById: admin.authUser.$id,
          performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
        }),
      ]);

      return NextResponse.json({ ok: true, status: 'active', lifted: true });
    }

    const firstUserId = await getFirstProtectedUserId(db);
    if (firstUserId && userId === firstUserId) {
      return NextResponse.json({ error: 'This primary administrator account is permanently protected' }, { status: 403 });
    }

    const targetDoc: any = await db.getDocument(DATABASE_ID, COL.USERS, userId);
    const targetRole = String(targetDoc.role || 'USER').toUpperCase();
    if (targetRole === 'SUPER' && admin.role !== 'SUPER') {
      return NextResponse.json({ error: 'Only a Super Admin can suspend another Super Admin' }, { status: 403 });
    }

    const days = Math.max(1, Math.min(365, Number.isFinite(rawDays) ? Math.round(rawDays) : 1));
    const suspendedUntil = new Date(Date.now() + days * 86_400_000).toISOString();

    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      status: 'suspended',
      is_suspended: true,
      suspended_until: suspendedUntil,
      ban_reason: reason,
      suspended_at: nowIso,
      suspended_by: adminUsername,
      suspended_by_name: adminName,
    });

    await db.createDocument(DATABASE_ID, COL.USER_BANS, ID.unique(), {
      user_id: userId,
      username: String(targetDoc.username || ''),
      admin_id: admin.authUser.$id,
      admin_name: adminName,
      banned_by: adminUsername,
      banned_by_name: adminName,
      reason,
      note: `${message} (Duration: ${days} day${days !== 1 ? 's' : ''}, until ${suspendedUntil})`,
      is_permanent: false,
      status: 'SUSPENDED',
      created_at: nowIso,
    }).catch(() => {});

    await Promise.allSettled([
      safeNotify({
        user_id: userId,
        from_user_id: admin.authUser.$id,
        from_user_name: adminName,
        type: 'SYSTEM',
        title: 'Account Suspended',
        content: `Your account was suspended for ${days} day(s): ${message}`,
      }),
      logSecurityEvent({
        event_type: 'ADMIN_SUSPEND',
        severity: 'WARN',
        user_id: userId,
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: userId,
        result: 'success',
        endpoint: '/api/admin/suspend',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `Suspended @${targetDoc.username || userId} for ${days}d by ${adminName} (@${adminUsername}): ${reason}`,
      }),
      createAuditEntry({
        action: 'USER_SUSPENDED',
        details: `@${targetDoc.username || userId} suspended for ${days} day(s) by ${adminName} (@${adminUsername}). Reason: ${reason}`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({
      ok: true,
      status: 'suspended',
      suspendedUntil,
      suspendedAt: nowIso,
      suspendedBy: adminUsername,
      suspendedByName: adminName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Suspend failed' }, { status: 500 });
  }
}
