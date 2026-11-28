import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import { createAuditEntry, requireAdminUser } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const serialNumber = String(body.serialNumber || '').trim().toUpperCase();
    if (!serialNumber) {
      return NextResponse.json({ error: 'serialNumber is required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.TICKETS, [
      Query.equal('serial_number', serialNumber),
      Query.limit(1),
    ]);

    if (res.documents.length === 0) {
      return NextResponse.json({
        status: 'not_found',
        message: `No ticket found with serial number "${serialNumber}".`,
      });
    }

    const ticket: any = res.documents[0];
    const ownerName = ticket.owner_name || 'Guest';

    if (ticket.is_used) {
      return NextResponse.json({
        status: 'used',
        message: `Sorry ${ownerName}, this ticket has already been used${ticket.checked_by_name ? ` (checked by ${ticket.checked_by_name})` : ''}.`,
        ticket,
      });
    }

    const nowIso = new Date().toISOString();
    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);

    const updatedTicket = await db.updateDocument(DATABASE_ID, COL.TICKETS, ticket.$id, {
      is_used: true,
      used_at: nowIso,
      checked_by: adminUsername,
      checked_by_name: adminName,
    });

    await createAuditEntry({
      action: 'TICKET_VERIFIED_ENTRY',
      details: `Ticket ${serialNumber} (${ownerName}) checked in by ${adminName} (@${adminUsername})`,
      performedBy: adminUsername,
      performedByName: adminName,
      performedById: admin.authUser.$id,
      performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
    });

    return NextResponse.json({
      status: 'valid',
      message: `Welcome ${ownerName}, Enjoy the Event!`,
      ticket: updatedTicket,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Ticket check failed' }, { status: 500 });
  }
}
