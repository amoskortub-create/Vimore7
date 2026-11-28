import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import {
  requireAdminUser,
  safeNotify,
  logSecurityEvent,
  createAuditEntry,
  getClientIp,
} from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden — Super Admin access required to restore accounts' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    const restoreNote = String(body.note || '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const targetDoc: any = await db.getDocument(DATABASE_ID, COL.USERS, userId);

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const nowIso = new Date().toISOString();
    const previousStatus = String(targetDoc.status || 'active').toLowerCase();

    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      status: 'active',
      is_suspended: false,
      suspended_until: null,
      ban_reason: '',
      banned_at: null,
      suspended_at: null,
    });

    try {
      const banDocs = await db.listDocuments(DATABASE_ID, COL.USER_BANS, [
        Query.equal('user_id', userId),
        Query.limit(50),
      ]);
      await Promise.allSettled(
        banDocs.documents
          .filter((d: any) => d.status !== 'RESTORED')
          .map((d: any) =>
            db.updateDocument(DATABASE_ID, COL.USER_BANS, d.$id, {
              status: 'RESTORED',
              restored_by: adminUsername,
              restored_by_name: adminName,
              restored_at: nowIso,
              ...(restoreNote ? { note: `${d.note ? d.note + ' | ' : ''}Restore note: ${restoreNote}` } : {}),
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
        content: restoreNote
          ? `Your account access has been restored by ${adminName}: ${restoreNote}`
          : `Your account access has been restored by a Super Administrator. Welcome back to ViMore.`,
      }),
      logSecurityEvent({
        event_type: 'ADMIN_RESTORE_ACCESS',
        severity: 'INFO',
        user_id: userId,
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        target_id: userId,
        result: 'success',
        endpoint: '/api/admin/restore-user',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `Super Admin ${adminName} (@${adminUsername}) restored ${previousStatus} account @${targetDoc.username || userId}${restoreNote ? ` — ${restoreNote}` : ''}`,
      }),
      createAuditEntry({
        action: 'USER_ACCESS_RESTORED',
        details: `@${targetDoc.username || userId} (previously ${previousStatus}) restored to active by ${adminName} (@${adminUsername})${restoreNote ? ` | Note: ${restoreNote}` : ''}`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({
      ok: true,
      userId,
      status: 'active',
      restoredByName: adminName,
      restoredByUsername: adminUsername,
      restoredAt: nowIso,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Restore failed' }, { status: 500 });
  }
}
