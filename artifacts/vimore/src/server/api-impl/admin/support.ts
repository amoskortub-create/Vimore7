import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import {
  createAuditEntry,
  requireAdminUser,
  safeNotify,
} from '@/lib/server-helpers';

const VALID_REPORT_ACTIONS = new Set(['PENDING', 'RESOLVED', 'DISMISSED']);
const VALID_TICKET_STATUSES = new Set(['OPEN', 'IN_REVIEW', 'CLOSED']);

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const type = String(body.type || '').trim();
    const db = getAdminDatabases();

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const adminAvatar = admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '';
    const nowIso = new Date().toISOString();

    if (type === 'report_action') {
      const reportId = String(body.reportId || '').trim();
      const action = String(body.action || '').toUpperCase();
      if (!reportId || !VALID_REPORT_ACTIONS.has(action)) {
        return NextResponse.json({ error: 'Invalid report action' }, { status: 400 });
      }
      await db.updateDocument(DATABASE_ID, COL.REPORTS, reportId, {
        status: action,
        resolved_by: adminUsername,
        resolved_by_name: adminName,
        resolved_at: nowIso,
      });
      await createAuditEntry({
        action: `REPORT_${action}`,
        details: `Report ${reportId} marked ${action} by ${adminName} (@${adminUsername})`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: adminAvatar,
      });
      return NextResponse.json({ ok: true, status: action });
    }

    if (type === 'ticket_status') {
      const ticketId = String(body.ticketId || '').trim();
      const status = String(body.status || '').toUpperCase();
      if (!ticketId || !VALID_TICKET_STATUSES.has(status)) {
        return NextResponse.json({ error: 'Invalid ticket status' }, { status: 400 });
      }
      await db.updateDocument(DATABASE_ID, COL.SUPPORT_TICKETS, ticketId, {
        status,
        replied_by: adminUsername,
        replied_by_name: adminName,
        replied_at: nowIso,
      });
      await createAuditEntry({
        action: status === 'CLOSED' ? 'TICKET_CLOSED' : 'TICKET_STATUS_UPDATED',
        details: `Support ticket ${ticketId} set to ${status} by ${adminName} (@${adminUsername})`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: adminAvatar,
      });
      return NextResponse.json({ ok: true, status });
    }

    if (type === 'ticket_reply') {
      const ticketId = String(body.ticketId || '').trim();
      const ticketUserId = String(body.ticketUserId || '').trim();
      const reply = String(body.reply || '').trim().slice(0, 1000);
      if (!ticketId || !reply) {
        return NextResponse.json({ error: 'ticketId and reply are required' }, { status: 400 });
      }

      const ticketDoc: any = await db.getDocument(DATABASE_ID, COL.SUPPORT_TICKETS, ticketId);
      const recipientId = ticketUserId || ticketDoc.user_id;

      await db.updateDocument(DATABASE_ID, COL.SUPPORT_TICKETS, ticketId, {
        status: 'IN_REVIEW',
        admin_reply: reply,
        replied_by: adminUsername,
        replied_by_name: adminName,
        replied_at: nowIso,
      });

      if (recipientId) {
        await safeNotify({
          user_id: recipientId,
          from_user_id: admin.authUser.$id,
          from_user_name: adminName,
          type: 'SYSTEM',
          title: `Support Reply: ${ticketDoc.subject || 'Ticket Update'}`,
          content: reply,
        });
      }

      await createAuditEntry({
        action: 'TICKET_REPLIED',
        details: `Reply sent for ticket ${ticketId} by ${adminName} (@${adminUsername})`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: adminAvatar,
      });

      return NextResponse.json({
        ok: true,
        status: 'IN_REVIEW',
        admin_reply: reply,
        replied_by: adminUsername,
        replied_by_name: adminName,
        replied_at: nowIso,
      });
    }

    return NextResponse.json({ error: 'Unsupported support action type' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Support action failed' }, { status: 500 });
  }
}
