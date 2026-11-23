import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { requireAdminUser } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const limit = 40;
    const cursor = req.nextUrl.searchParams.get('cursor');
    const queries: string[] = [
      Query.orderDesc('$createdAt'),
      Query.limit(limit + 1),
    ];
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.SECURITY_EVENTS, queries);
    const hasMore = res.documents.length > limit;
    const documents = hasMore ? res.documents.slice(0, limit) : res.documents;

    return NextResponse.json({ documents, hasMore });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load security events' }, { status: 500 });
  }
}
