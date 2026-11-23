import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { generateUSSD } from '@/lib/ld-monetization';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

const DEFAULT_SUB_LD = 250;

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const creatorUserId = String(body.creatorUserId || '').trim();
    if (!creatorUserId) {
      return NextResponse.json({ error: 'creatorUserId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const accounts = await db.listDocuments(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, [
      Query.equal('user_id', creatorUserId),
      Query.limit(1),
    ]);
    const account = accounts.documents[0];
    if (!account?.orange_money_number) {
      return NextResponse.json(
        { error: 'Creator Orange Money account is not available.' },
        { status: 404 }
      );
    }

    const amountLD = Math.max(50, Number(body.amountLD || DEFAULT_SUB_LD));
    const ussd = generateUSSD(account.orange_money_number, amountLD);
    const dialerUri = `tel:${encodeURIComponent(ussd)}`;

    await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, ID.unique(), {
      sender_id: session.authUser.$id,
      receiver_id: creatorUserId,
      transaction_type: 'subscription',
      amount_ld: amountLD,
      status: 'INITIATED',
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({ ok: true, dialerUri, ussd, amountLD });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Monetization subscribe failed' }, { status: 500 });
  }
}
