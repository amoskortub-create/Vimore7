import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { requireAdminUser, safeNotify, logSecurityEvent } from '@/lib/server-helpers';

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

    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      warning_count: nextWarnings,
    });

    await safeNotify({
      user_id: userId,
      from_user_id: admin.authUser.$id,
      type: 'SYSTEM',
      title: severity === 'FINAL' ? '⚠️ Final Account Warning' : '⚠️ Account Warning',
      content: message,
    });

    await logSecurityEvent({
      event_type: 'ADMIN_WARN',
      severity: severity === 'FINAL' ? 'CRITICAL' : 'WARNING',
      user_id: userId,
      details: `Warning (${severity}) #${nextWarnings}: ${message}`,
    });

    return NextResponse.json({ ok: true, warning_count: nextWarnings });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Warn failed' }, { status: 500 });
  }
}
