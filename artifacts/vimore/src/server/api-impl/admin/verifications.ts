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

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.VERIFICATION_RECORDS, [
      Query.equal('status', 'PENDING'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]);

    return NextResponse.json({ records: res.documents });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load verifications' }, { status: 500 });
  }
}
