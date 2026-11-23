import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { isValidOrangeMoneyNumber } from '@/lib/ld-monetization';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, [
      Query.equal('user_id', session.authUser.$id),
      Query.limit(1),
    ]);
    const doc = res.documents[0];
    if (!doc) {
      return NextResponse.json({ account: null });
    }

    return NextResponse.json({
      account: {
        accountName: doc.account_name || '',
        orangeMoneyNumber: doc.orange_money_number || '',
        isVerified: Boolean(doc.is_verified),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ account: null, error: err?.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const accountName = String(body.accountName || '').trim();
    const orangeMoneyNumber = String(body.orangeMoneyNumber || '').trim();

    if (!accountName || !isValidOrangeMoneyNumber(orangeMoneyNumber)) {
      return NextResponse.json(
        { error: 'Valid accountName and Liberian Orange Money number (07... or +231...) required.' },
        { status: 400 }
      );
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, [
      Query.equal('user_id', session.authUser.$id),
      Query.limit(1),
    ]);

    const existing = res.documents[0];
    const doc = existing
      ? await db.updateDocument(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, existing.$id, {
          account_name: accountName,
          orange_money_number: orangeMoneyNumber,
        })
      : await db.createDocument(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, ID.unique(), {
          user_id: session.authUser.$id,
          account_name: accountName,
          orange_money_number: orangeMoneyNumber,
          is_verified: false,
        });

    return NextResponse.json({
      ok: true,
      account: {
        accountName: doc.account_name,
        orangeMoneyNumber: doc.orange_money_number,
        isVerified: Boolean(doc.is_verified),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Save failed' }, { status: 500 });
  }
}
