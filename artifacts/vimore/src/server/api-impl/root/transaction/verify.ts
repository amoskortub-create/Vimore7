import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile, getUserBalance, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.profileDoc.is_verified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const body = await req.json().catch(() => ({}));
    const currency = String(body.currency || 'DIAMOND').toUpperCase();
    const cost = Math.max(1, Math.floor(Number(body.cost || 100)));

    const db = getAdminDatabases();
    const pending = await db.listDocuments(DATABASE_ID, COL.VERIFICATION_RECORDS, [
      Query.equal('user_id', session.authUser.$id),
      Query.equal('status', 'PENDING'),
      Query.limit(1),
    ]);
    if (pending.documents[0]) {
      return NextResponse.json({
        ok: true,
        status: 'PENDING',
        newBalance:
          currency === 'STAR'
            ? Number(session.profileDoc.star_balance || 0)
            : getUserBalance(session.profileDoc),
      });
    }

    let newBalance = 0;
    if (currency === 'STAR') {
      const current = Number(session.profileDoc.star_balance || 0);
      if (current < cost) {
        return NextResponse.json({ error: 'Insufficient Star balance' }, { status: 400 });
      }
      newBalance = current - cost;
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        star_balance: newBalance,
      });
    } else {
      const current = getUserBalance(session.profileDoc);
      if (current < cost) {
        return NextResponse.json({ error: 'Insufficient Credit balance' }, { status: 400 });
      }
      newBalance = current - cost;
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        credit_balance: newBalance,
        diamond_balance: newBalance,
      });
    }

    await db.createDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, ID.unique(), {
      user_id: session.authUser.$id,
      username: String(session.profileDoc.username || ''),
      name: String(session.profileDoc.name || ''),
      currency,
      cost,
      status: 'PENDING',
      submitted_at: new Date().toISOString(),
    });

    await safeNotify({
      user_id: session.authUser.$id,
      type: 'SYSTEM',
      title: 'Verification Submitted',
      content: 'Your verification application is pending administrator review.',
      action_href: '/settings',
    });

    return NextResponse.json({ ok: true, status: 'PENDING', newBalance });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Verification failed' }, { status: 500 });
  }
}
