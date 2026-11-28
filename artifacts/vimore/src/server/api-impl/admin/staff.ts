import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import {
  requireAdminUser,
  getFirstProtectedUserId,
  safeNotify,
  logSecurityEvent,
  createAuditEntry,
  getClientIp,
} from '@/lib/server-helpers';

const ALLOWED_STAFF_ROLES = new Set(['MODERATOR', 'FINANCIAL', 'USER']);

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden — Super Admin required' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toLowerCase();
    const username = String(body.username || '').trim().replace(/^@/, '');
    const requestedRole = String(body.role || 'USER').toUpperCase();

    if (!username || (action !== 'promote' && action !== 'demote')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.USERS, [
      Query.equal('username', username),
      Query.limit(1),
    ]);
    const targetDoc: any = res.documents[0];
    if (!targetDoc) {
      return NextResponse.json({ error: `User @${username} not found` }, { status: 404 });
    }

    const firstUserId = await getFirstProtectedUserId(db);
    if (firstUserId && targetDoc.$id === firstUserId) {
      return NextResponse.json({ error: 'The primary Super Admin account cannot be modified' }, { status: 403 });
    }
    if (action === 'demote' && targetDoc.$id === admin.authUser.$id) {
      return NextResponse.json({ error: 'Cannot demote your own Super Admin account' }, { status: 400 });
    }

    const nextRole = action === 'demote' ? 'USER' : requestedRole;
    if (!ALLOWED_STAFF_ROLES.has(nextRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    await db.updateDocument(DATABASE_ID, COL.USERS, targetDoc.$id, { role: nextRole });

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);

    await Promise.allSettled([
      safeNotify({
        user_id: targetDoc.$id,
        from_user_id: admin.authUser.$id,
        from_user_name: adminName,
        type: 'SYSTEM',
        title: action === 'promote' ? 'Admin Role Assigned' : 'Admin Role Removed',
        content:
          action === 'promote'
            ? `You have been assigned the ${nextRole} role by ${adminName}.`
            : `Your admin privileges have been removed by ${adminName}.`,
      }),
      logSecurityEvent({
        event_type: action === 'promote' ? 'STAFF_PROMOTED' : 'STAFF_DEMOTED',
        severity: 'WARN',
        user_id: targetDoc.$id,
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: targetDoc.$id,
        result: 'success',
        endpoint: '/api/admin/staff',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `${adminName} (@${adminUsername}) set @${username} role to ${nextRole}`,
      }),
      createAuditEntry({
        action: action === 'promote' ? 'STAFF_PROMOTED' : 'STAFF_REMOVED',
        details: `@${username} role updated to ${nextRole} by ${adminName} (@${adminUsername})`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({
      ok: true,
      user: {
        $id: targetDoc.$id,
        name: targetDoc.name || targetDoc.display_name || username,
        username: targetDoc.username,
        avatar: targetDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, targetDoc.avatar_id) : '',
        role: nextRole,
        assignedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Staff update failed' }, { status: 500 });
  }
}
