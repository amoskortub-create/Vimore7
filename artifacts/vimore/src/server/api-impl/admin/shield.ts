import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import {
  createAuditEntry,
  getClientIp,
  logSecurityEvent,
  requireAdminUser,
  safeNotify,
} from '@/lib/server-helpers';

const ALLOWED_STATUSES = new Set(['open', 'resolved', 'dismissed']);

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();
    const url = new URL(req.url);
    const rawStatus = String(url.searchParams.get('status') || 'open').toLowerCase();
    const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : 'open';

    const [reportsRes, openRes, resolvedRes, dismissedRes] = await Promise.all([
      db.listDocuments(DATABASE_ID, COL.ADMIN_REPORTS, [
        Query.equal('status', status),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ]),
      db.listDocuments(DATABASE_ID, COL.ADMIN_REPORTS, [Query.equal('status', 'open'), Query.limit(1)]),
      db.listDocuments(DATABASE_ID, COL.ADMIN_REPORTS, [Query.equal('status', 'resolved'), Query.limit(1)]),
      db.listDocuments(DATABASE_ID, COL.ADMIN_REPORTS, [Query.equal('status', 'dismissed'), Query.limit(1)]),
    ]);

    return NextResponse.json({
      reports: reportsRes.documents || [],
      counts: {
        open: openRes.total || 0,
        resolved: resolvedRes.total || 0,
        dismissed: dismissedRes.total || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load AI shield reports' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reportId = String(body.reportId || '').trim();
    const action = String(body.action || '').toLowerCase();

    if (!reportId || (action !== 'remove' && action !== 'dismiss')) {
      return NextResponse.json({ error: 'Invalid shield action' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const report: any = await db.getDocument(DATABASE_ID, COL.ADMIN_REPORTS, reportId);
    const nowIso = new Date().toISOString();
    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);

    if (action === 'remove') {
      if (report.collection_name && report.doc_id) {
        await db.deleteDocument(DATABASE_ID, report.collection_name, report.doc_id).catch(() => {});
      }

      await db.updateDocument(DATABASE_ID, COL.ADMIN_REPORTS, reportId, {
        status: 'resolved',
        resolved_by: admin.authUser.$id,
        resolved_at: nowIso,
      });

      if (report.user_id) {
        await safeNotify({
          user_id: report.user_id,
          from_user_id: admin.authUser.$id,
          from_user_name: adminName,
          type: 'MODERATION',
          title: 'Content removed',
          content: `Your content was removed for violating ViMore's Terms of Service. Reason: ${report.reason || 'Policy violation'}`,
        });
      }

      await Promise.allSettled([
        createAuditEntry({
          action: 'AI_SHIELD_CONTENT_REMOVED',
          details: `Removed ${report.collection_name}/${report.doc_id} from shield report ${reportId}`,
          performedBy: adminUsername,
          performedByName: adminName,
          performedById: admin.authUser.$id,
          performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
        }),
        logSecurityEvent({
          event_type: 'SHIELD_CONTENT_REMOVED',
          severity: 'WARN',
          user_id: report.user_id || '',
          actor_id: admin.authUser.$id,
          actor_role: admin.role,
          target_id: report.doc_id || reportId,
          result: 'success',
          endpoint: '/api/admin/shield',
          method: 'POST',
          ip_address: getClientIp(req),
          details: `${adminName} (@${adminUsername}) removed flagged ${report.collection_name} ${report.doc_id}`,
        }),
      ]);

      return NextResponse.json({ ok: true, status: 'resolved' });
    }

    // action === 'dismiss'
    await db.updateDocument(DATABASE_ID, COL.ADMIN_REPORTS, reportId, {
      status: 'dismissed',
      resolved_by: admin.authUser.$id,
      resolved_at: nowIso,
    });

    if (report.collection_name && report.doc_id) {
      await db
        .updateDocument(DATABASE_ID, report.collection_name, report.doc_id, { status: 'published' })
        .catch(() => {});
    }

    await createAuditEntry({
      action: 'AI_SHIELD_REPORT_DISMISSED',
      details: `Dismissed shield report ${reportId} (${report.collection_name}/${report.doc_id})`,
      performedBy: adminUsername,
      performedByName: adminName,
      performedById: admin.authUser.$id,
      performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
    });

    return NextResponse.json({ ok: true, status: 'dismissed' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Shield action failed' }, { status: 500 });
  }
}
