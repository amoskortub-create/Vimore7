import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';
import { roundCredits } from '@/lib/credit-monetization';

const ADMIN_ROLES = new Set(['SUPER', 'MODERATOR', 'FINANCIAL']);

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  if (!ADMIN_ROLES.has(session.role ?? '')) {
    return NextResponse.json({ error: 'Admin role required.' }, { status: 403 });
  }

  const result = await getAdminDatabases().listDocuments(DATABASE_ID, 'platform_fees', [
    Query.limit(500),
  ]);
  const totalPlatformFeeCredits = roundCredits(
    result.documents.reduce((total, fee) => total + Number(fee.amountCredits || 0), 0),
  );
  return NextResponse.json({ totalPlatformFeeCredits });
}
