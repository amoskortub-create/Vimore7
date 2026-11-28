import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import {
  requireAdminUser,
  logSecurityEvent,
  createAuditEntry,
  getFirstProtectedUserId,
  safeNotify,
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
    const reason = String(body.reason || 'Policy violation').trim();
    const note = String(body.note || '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    if (userId === admin.authUser.$id) {
      return NextResponse.json({ error: 'Cannot ban your own account' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const firstUserId = await getFirstProtectedUserId(db);
    if (firstUserId && userId === firstUserId) {
      return NextResponse.json({ error: 'This primary administrator account is permanently protected' }, { status: 403 });
    }

    const targetDoc: any = await db.getDocument(DATABASE_ID, COL.USERS, userId);
    const targetRole = String(targetDoc.role || 'USER').toUpperCase();
    if (targetRole === 'SUPER' && admin.role !== 'SUPER') {
      return NextResponse.json({ error: 'Only a Super Admin can ban another Super Admin' }, { status: 403 });
    }

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const nowIso = new Date().toISOString();

    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      status: 'banned',
      is_suspended: false,
      ban_reason: reason,
      banned_at: nowIso,
      banned_by: adminUsername,
      banned_by_name: adminName,
    });

    await db.createDocument(DATABASE_ID, COL.USER_BANS, ID.unique(), {
      user_id: userId,
      username: String(targetDoc.username || ''),
      admin_id: admin.authUser.$id,
      admin_name: adminName,
      banned_by: adminUsername,
      banned_by_name: adminName,
      reason,
      note,
      is_permanent: true,
      status: 'ACTIVE',
      created_at: nowIso,
    }).catch(() => {});

    await Promise.allSettled([
      safeNotify({
        user_id: userId,
        from_user_id: admin.authUser.$id,
        from_user_name: adminName,
        type: 'SYSTEM',
        title: 'Account Banned',
        content: `Your account has been permanently banned: ${reason}`,
      }),
      logSecurityEvent({
        event_type: 'ADMIN_BAN',
        severity: 'CRITICAL',
        user_id: userId,
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: userId,
        result: 'success',
        endpoint: '/api/admin/ban',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `Banned @${targetDoc.username || userId} by ${adminName} (@${adminUsername}): ${reason}${note ? ` | Note: ${note}` : ''}`,
      }),
      createAuditEntry({
        action: 'USER_BANNED',
        details: `@${targetDoc.username || userId} permanently banned by ${adminName} (@${adminUsername}). Reason: ${reason}${note ? ` | Note: ${note}` : ''}`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({
      ok: true,
      status: 'banned',
      bannedAt: nowIso,
      bannedBy: adminUsername,
      bannedByName: adminName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Ban failed' }, { status: 500 });
  }
}
