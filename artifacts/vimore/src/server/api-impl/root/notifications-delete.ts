import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const notificationId = String(body.notificationId || '').trim();
    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId required' }, { status: 400 });
    }

    if (notificationId.startsWith('notif_')) {
      return NextResponse.json({ ok: true });
    }

    const db = getAdminDatabases();
    try {
      const doc = await db.getDocument(DATABASE_ID, COL.NOTIFICATIONS, notificationId);
      if (doc.user_id !== session.authUser.$id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      await db.deleteDocument(DATABASE_ID, COL.NOTIFICATIONS, notificationId);
    } catch {
      // already deleted
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Notification delete failed' }, { status: 500 });
  }
}
