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
    const subscription = body.subscription;
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Valid push subscription required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      push_subscription: JSON.stringify(subscription),
      push_enabled: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Push subscribe failed' }, { status: 500 });
  }
}
