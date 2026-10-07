import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';
import { Query } from 'node-appwrite';

export const maxDuration = 15;

const COLLECTION_ID = 'push_subscriptions';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const { endpoint, token, platform } = body || {};
    if (typeof token === 'string') {
      if (token.length < 20 || token.length > 4096 || platform !== 'web') {
        return NextResponse.json({ error: 'Invalid FCM token.' }, { status: 400 });
      }
      const db = getAdminDatabases();
      const registered = await db.listDocuments(DATABASE_ID, 'native_push_tokens', [
        Query.equal('token', token),
        Query.equal('user_id', session.userId),
        Query.equal('platform', 'web'),
        Query.limit(10),
      ]);
      await Promise.all(registered.documents.map((doc: any) =>
        db.deleteDocument(DATABASE_ID, 'native_push_tokens', doc.$id),
      ));
      return NextResponse.json({ ok: true });
    }
    if (typeof endpoint !== 'string' || endpoint.length > 2048) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    try {
      const db = getAdminDatabases();
      const existing = await db.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.equal('endpoint', endpoint),
        Query.equal('user_id', session.userId),
        Query.limit(1),
      ]);
      if (existing.total > 0) {
        await db.deleteDocument(DATABASE_ID, COLLECTION_ID, existing.documents[0].$id);
      }
    } catch (err: any) {
      console.warn('[push/unsubscribe] storage cleanup failed:', err?.message || err);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Bad request' }, { status: 400 });
  }
}
