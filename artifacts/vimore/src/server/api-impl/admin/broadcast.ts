import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import {
  requireAdminUser,
  listAllDocuments,
  createAuditEntry,
  logSecurityEvent,
  getClientIp,
} from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.ADMIN_NOTIFICATIONS, [
      Query.orderDesc('$createdAt'),
      Query.limit(50),
    ]);
    return NextResponse.json({ documents: res.documents });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load broadcast history' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || '').trim().slice(0, 120);
    const message = String(body.message || '').trim().slice(0, 500);
    const actionUrl = body.actionUrl ? String(body.actionUrl).trim().slice(0, 256) : '';
    const targetUserIds = body.targetUserIds;

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    let targets: string[] = [];
    const targetType = targetUserIds === 'all' ? 'ALL' : 'TARGETED';

    if (targetUserIds === 'all') {
      const users = await listAllDocuments(db, COL.USERS, [], 2000);
      targets = users
        .filter((u: any) => !u.is_deleted && String(u.status || '').toLowerCase() !== 'banned' && u.$id !== admin.authUser.$id)
        .map((u: any) => u.$id);
    } else if (Array.isArray(targetUserIds)) {
      targets = Array.from(new Set(targetUserIds.map((id: any) => String(id || '').trim()).filter(Boolean)));
    }

    if (targets.length === 0) {
      return NextResponse.json({ error: 'No valid target users found' }, { status: 400 });
    }

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const nowIso = new Date().toISOString();

    const broadcastDoc = await db.createDocument(DATABASE_ID, COL.ADMIN_NOTIFICATIONS, ID.unique(), {
      user_id: admin.authUser.$id,
      type: 'BROADCAST',
      title,
      content: message,
      message,
      is_read: false,
      target_type: targetType,
      recipient_count: targets.length,
      sent_at: nowIso,
      ...(actionUrl ? { action_url: actionUrl } : {}),
    });

    let delivered = 0;
    const BATCH = 25;
    for (let i = 0; i < targets.length; i += BATCH) {
      const chunk = targets.slice(i, i + BATCH);
      const res = await Promise.allSettled(
        chunk.map((uid) =>
          db.createDocument(DATABASE_ID, COL.NOTIFICATIONS, ID.unique(), {
            user_id: uid,
            from_user_id: admin.authUser.$id,
            from_user_name: adminName,
            type: 'SYSTEM',
            title,
            content: message,
            message,
            is_read: false,
            ...(actionUrl ? { action_href: actionUrl } : {}),
          })
        )
      );
      delivered += res.filter((r) => r.status === 'fulfilled').length;
    }

    await Promise.allSettled([
      logSecurityEvent({
        event_type: 'ADMIN_BROADCAST',
        severity: 'INFO',
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        result: 'success',
        endpoint: '/api/admin/broadcast',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `${adminName} (@${adminUsername}) sent ${targetType} broadcast "${title}" to ${delivered}/${targets.length} users`,
      }),
      createAuditEntry({
        action: 'BROADCAST_SENT',
        details: `Broadcast "${title}" delivered to ${delivered} user(s)`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
    ]);

    return NextResponse.json({
      ok: true,
      delivered,
      totalTargets: targets.length,
      broadcastDoc,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Broadcast failed' }, { status: 500 });
  }
}
