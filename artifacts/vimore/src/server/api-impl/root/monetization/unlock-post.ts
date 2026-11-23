import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
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
    const postId = String(body.postId || '').trim();
    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const post = await db.getDocument(DATABASE_ID, COL.POSTS, postId);
    const creatorUserId = String(post.user_id || '');
    const amountLD = Math.max(10, Number(post.unlock_price_ld || post.unlock_price || 50));

    const accounts = await db.listDocuments(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, [
      Query.equal('user_id', creatorUserId),
      Query.limit(1),
    ]);
    const account = accounts.documents[0];
    if (!account?.orange_money_number) {
      return NextResponse.json(
        { error: 'Creator Orange Money account unavailable for this post.' },
        { status: 404 }
      );
    }

    const ussd = generateUSSD(account.orange_money_number, amountLD);
    const dialerUri = `tel:${encodeURIComponent(ussd)}`;

    await db.createDocument(DATABASE_ID, COL.TRANSACTIONS, ID.unique(), {
      sender_id: session.authUser.$id,
      receiver_id: creatorUserId,
      transaction_type: 'locked_post',
      amount_ld: amountLD,
      item_id: postId,
      item_type: 'post',
      status: 'INITIATED',
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({ ok: true, dialerUri, ussd, amountLD });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unlock failed' }, { status: 500 });
  }
}
