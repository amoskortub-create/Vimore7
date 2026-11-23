import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const receiverUserId = String(body.receiverUserId || '').trim();
    const transactionType = String(body.transactionType || 'gift').trim();
    const amountLD = Number(body.amountLD || 0);
    const itemId = body.itemId ? String(body.itemId) : undefined;
    const itemType = body.itemType ? String(body.itemType) : undefined;

    if (!receiverUserId || amountLD <= 0) {
      return NextResponse.json({ error: 'receiverUserId and positive amountLD required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const doc = await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, ID.unique(), {
      sender_id: session.authUser.$id,
      receiver_id: receiverUserId,
      transaction_type: transactionType,
      amount_ld: amountLD,
      item_id: itemId,
      item_type: itemType,
      status: 'INITIATED',
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, transaction: doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not log transaction' }, { status: 500 });
  }
}
