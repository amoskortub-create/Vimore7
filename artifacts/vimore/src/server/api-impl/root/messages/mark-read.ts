import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
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
    const messageIds: string[] = Array.isArray(body.messageIds)
      ? body.messageIds
      : body.messageId
        ? [String(body.messageId)]
        : [];
    const clusterId = body.clusterId ? String(body.clusterId) : '';
    const db = getAdminDatabases();

    let updated = 0;
    if (messageIds.length > 0) {
      for (const id of messageIds.slice(0, 100)) {
        try {
          const msg = await db.getDocument(DATABASE_ID, COL.MESSAGES, id);
          if (msg.receiver_id === session.authUser.$id && !msg.is_read) {
            await db.updateDocument(DATABASE_ID, COL.MESSAGES, id, { is_read: true });
            updated += 1;
          }
        } catch {
          // ignore missing
        }
      }
    } else if (clusterId) {
      const unread = await db.listDocuments(DATABASE_ID, COL.MESSAGES, [
        Query.equal('cluster_id', clusterId),
        Query.equal('receiver_id', session.authUser.$id),
        Query.equal('is_read', false),
        Query.limit(100),
      ]);
      for (const msg of unread.documents) {
        await db.updateDocument(DATABASE_ID, COL.MESSAGES, msg.$id, { is_read: true }).catch(() => {});
        updated += 1;
      }
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Mark read failed' }, { status: 500 });
  }
}
