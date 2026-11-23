import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';

export async function GET(req: NextRequest) {
  try {
    const clusterId = req.nextUrl.searchParams.get('clusterId') || '';
    if (!clusterId || !clusterId.startsWith('mkt_')) {
      return NextResponse.json({ error: 'Valid marketplace clusterId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.MESSAGES, [
      Query.equal('cluster_id', clusterId),
      Query.orderAsc('$createdAt'),
      Query.limit(200),
    ]);

    return NextResponse.json({ messages: res.documents });
  } catch (err: any) {
    return NextResponse.json({ messages: [], error: err?.message });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const clusterId = req.nextUrl.searchParams.get('clusterId') || '';
    if (!clusterId || !clusterId.startsWith('mkt_')) {
      return NextResponse.json({ error: 'Valid marketplace clusterId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.MESSAGES, [
      Query.equal('cluster_id', clusterId),
      Query.equal('is_read', false),
      Query.limit(100),
    ]);

    for (const msg of res.documents) {
      await db.updateDocument(DATABASE_ID, COL.MESSAGES, msg.$id, { is_read: true }).catch(() => {});
    }

    return NextResponse.json({ ok: true, updated: res.documents.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Mark read failed' }, { status: 500 });
  }
}
