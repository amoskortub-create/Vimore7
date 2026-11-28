import { NextRequest, NextResponse } from 'next/server';
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
    const token = String(body.token || '').trim();
    const subscription = body.subscription;

    if (!token && !subscription) {
      return NextResponse.json({ error: 'token or subscription required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      ...(token ? { fcm_token: token, push_token: token } : {}),
      ...(subscription ? { push_subscription: JSON.stringify(subscription) } : {}),
      push_enabled: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Native push registration failed' }, { status: 500 });
  }
}
