import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

const ALLOWED_FIELDS = new Set([
  'name',
  'bio',
  'avatar',
  'avatar_id',
  'cover',
  'cover_id',
  'nationality',
  'country',
  'city',
  'website',
  'gender',
  'date_of_birth',
  'phone',
  'is_private',
  'show_activity',
  'language',
  'preferred_language',
]);

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, any> = {};

    for (const [key, value] of Object.entries(body || {})) {
      if (ALLOWED_FIELDS.has(key) && value !== undefined) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, profileDoc: session.profileDoc });
    }

    const db = getAdminDatabases();
    const updated = await db.updateDocument(
      DATABASE_ID,
      COL.USERS,
      session.authUser.$id,
      updates
    );

    return NextResponse.json({ ok: true, profileDoc: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Profile update failed' }, { status: 500 });
  }
}
