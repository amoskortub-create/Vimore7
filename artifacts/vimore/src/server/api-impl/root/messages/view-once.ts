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
    const messageId = String(body.messageId || '').trim();
    const isGroup = Boolean(body.isGroup);

    if (!messageId) {
      return NextResponse.json({ error: 'messageId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const collection = isGroup ? COL.GROUP_MESSAGES : COL.MESSAGES;
    const updated = await db.updateDocument(DATABASE_ID, collection, messageId, {
      is_viewed: true,
      media_url: '',
      media_id: '',
    });

    return NextResponse.json({ ok: true, message: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'View-once update failed' }, { status: 500 });
  }
}
