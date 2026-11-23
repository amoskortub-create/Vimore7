import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { requireAdminUser, logSecurityEvent, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    const days = Math.max(1, Number(body.days || 1));
    const reason = String(body.reason || 'Policy violation').trim();
    const message = String(body.message || reason).trim();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const suspendedUntil = new Date(Date.now() + days * 86_400_000).toISOString();
    const db = getAdminDatabases();
    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      status: 'suspended',
      suspended_until: suspendedUntil,
      suspension_reason: reason,
      suspension_message: message,
    });

    await safeNotify({
      user_id: userId,
      type: 'SYSTEM',
      title: 'Account Suspended',
      content: `Your account was suspended for ${days} day(s): ${message}`,
    });

    await logSecurityEvent({
      event_type: 'ADMIN_SUSPEND',
      severity: 'WARNING',
      user_id: userId,
      details: `Suspended ${days}d by @${admin.profileDoc.username || admin.authUser.$id}: ${reason}`,
    });

    return NextResponse.json({ ok: true, suspendedUntil });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Suspend failed' }, { status: 500 });
  }
}
