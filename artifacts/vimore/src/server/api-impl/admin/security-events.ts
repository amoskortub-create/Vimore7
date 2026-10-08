import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== 'SUPER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const cursor = req.nextUrl.searchParams.get('cursor');
  if (cursor && !/^[a-zA-Z0-9._-]{1,64}$/.test(cursor)) {
    return NextResponse.json({ error: 'Invalid cursor.' }, { status: 400 });
  }

  try {
    const queries: string[] = [Query.orderDesc('$createdAt'), Query.limit(PAGE_SIZE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await getAdminDatabases().listDocuments(
      DATABASE_ID,
      'security_events',
      queries,
    );

    return NextResponse.json(
      { documents: page.documents, hasMore: page.documents.length === PAGE_SIZE },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Unable to load security events.' }, { status: 500 });
  }
}