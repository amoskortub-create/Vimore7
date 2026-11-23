import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { generateUSSD } from '@/lib/ld-monetization';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const creatorUserId = String(body.creatorUserId || '').trim();
    const amountLD = Number(body.amountLD || 0);

    if (!creatorUserId || amountLD <= 0) {
      return NextResponse.json({ error: 'creatorUserId and positive amountLD required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const accounts = await db.listDocuments(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, [
      Query.equal('user_id', creatorUserId),
      Query.limit(1),
    ]);
    const account = accounts.documents[0];
    if (!account?.orange_money_number) {
      return NextResponse.json(
        { error: 'Creator has not configured an Orange Money payout number.' },
        { status: 404 }
      );
    }

    const ussd = generateUSSD(account.orange_money_number, amountLD);
    const dialerUri = `tel:${encodeURIComponent(ussd)}`;
    return NextResponse.json({ ok: true, ussd, dialerUri });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'USSD generation failed' }, { status: 500 });
  }
}
