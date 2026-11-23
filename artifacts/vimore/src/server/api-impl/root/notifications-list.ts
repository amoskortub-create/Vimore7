import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.NOTIFICATIONS, [
      Query.equal('user_id', session.authUser.$id),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]);

    return NextResponse.json({ documents: res.documents, total: res.total });
  } catch (err: any) {
    return NextResponse.json({ documents: [], total: 0, error: err?.message });
  }
}
