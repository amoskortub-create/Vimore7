import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { COL } from '@/lib/appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const screenshotId = String(body.screenshot_id || '').trim();
    if (!screenshotId || screenshotId === 'upload_failed') {
      return NextResponse.json(
        { error: 'Payment receipt screenshot could not be uploaded. Please try again.' },
        { status: 400 }
      );
    }

    const userId = session.authUser.$id;
    const profileDoc = session.profileDoc;
    const db = getAdminDatabases();

    const payload: Record<string, any> = {
      user_id: userId,
      from_user_id: userId,
      to_user_id: 'platform',
      username: String(profileDoc?.username || body.username || ''),
      name: String(profileDoc?.name || body.name || session.authUser.name || ''),
      currency: String(body.currency || 'USD').slice(0, 16),
      amount: Number.isFinite(Number(body.amount)) ? Number(body.amount) : 0,
      message: String(body.package_name || body.message || '').slice(0, 512),
      package_name: String(body.package_name || '').slice(0, 128),
      coin_type: String(body.coin_type || 'Credits').slice(0, 16),
      coin_amount: Math.max(0, Math.round(Number(body.coin_amount) || 0)),
      screenshot_id: screenshotId.slice(0, 36),
      status: 'PENDING',
    };

    if (typeof body.code === 'string' && body.code.trim()) {
      payload.code = body.code.trim().slice(0, 64);
    }

    const doc = await db.createDocument(DATABASE_ID, COL.PAYMENT_REQUESTS, ID.unique(), payload);

    return NextResponse.json({ ok: true, doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not submit payment request.' }, { status: 500 });
  }
}
