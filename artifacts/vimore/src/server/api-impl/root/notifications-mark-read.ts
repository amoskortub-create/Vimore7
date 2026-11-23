import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.notificationIds) ? body.notificationIds : [];
    const db = getAdminDatabases();
    let updated = 0;

    for (const id of ids.slice(0, 100)) {
      if (!id || id.startsWith('notif_')) continue;
      try {
        const doc = await db.getDocument(DATABASE_ID, COL.NOTIFICATIONS, id);
        if (doc.user_id === session.authUser.$id && !doc.is_read) {
          await db.updateDocument(DATABASE_ID, COL.NOTIFICATIONS, id, { is_read: true });
          updated += 1;
        }
      } catch {
        // ignore missing
      }
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Mark read failed' }, { status: 500 });
  }
}
