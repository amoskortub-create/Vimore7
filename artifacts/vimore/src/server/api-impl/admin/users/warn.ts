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
    const userId = String(body.userId || '').trim();
    const message = String(body.message || 'Community guidelines warning').trim();
    const severity = body.severity === 'FINAL' ? 'FINAL' : 'SOFT';

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const targetDoc: any = await db.getDocument(DATABASE_ID, COL.USERS, userId);
    const nextWarnings = Number(targetDoc.warning_count || 0) + 1;
    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);

    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      warning_count: nextWarnings,
    });

    await Promise.allSettled([
      safeNotify({
        user_id: userId,
        from_user_id: admin.authUser.$id,
        from_user_name: adminName,
        type: 'SYSTEM',
        title: severity === 'FINAL' ? '⚠️ Final Account Warning' : '⚠️ Account Warning',
        content: message,
      }),
      logSecurityEvent({
        event_type: 'ADMIN_WARN',
        severity: severity === 'FINAL' ? 'CRITICAL' : 'WARN',
        user_id: userId,
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: userId,
        result: 'success',
        endpoint: '/api/admin/users/warn',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `Warning (${severity}) #${nextWarnings} to @${targetDoc.username || userId} by ${adminName}: ${message}`,
      }),
      createAuditEntry({
        action: 'USER_WARNED',
        details: `@${targetDoc.username || userId} issued ${severity} warning (#${nextWarnings}): ${message}`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({ ok: true, warning_count: nextWarnings });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Warn failed' }, { status: 500 });
  }
}
