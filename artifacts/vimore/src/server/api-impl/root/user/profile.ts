import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases, getAdminUsers } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

const ALLOWED_FIELDS = new Set([
  'name',
  'display_name',
  'bio',
  'category',
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

    if (typeof updates.name === 'string') {
      const cleanName = updates.name.trim();
      if (!cleanName || cleanName.length > 120) {
        return NextResponse.json({ error: 'Name must be between 1 and 120 characters.' }, { status: 400 });
      }
      updates.name = cleanName;
      updates.display_name = cleanName;
    }

    if (typeof updates.phone === 'string') {
      updates.phone = updates.phone.replace(/[\s\-().]/g, '').slice(0, 32);
    }

    if (Object.keys(updates).length === 0) {
      const { biometric_pin_hash: _pin, security_answer: _sa, ...safeDoc } = session.profileDoc;
      return NextResponse.json({ ok: true, profileDoc: safeDoc });
    }

    const db = getAdminDatabases();
    const updated = await db.updateDocument(
      DATABASE_ID,
      COL.USERS,
      session.authUser.$id,
      updates
    );

    if (updates.name) {
      getAdminUsers().updateName(session.authUser.$id, updates.name).catch(() => {});
    }

    const { biometric_pin_hash: _pin, security_answer: _sa, ...safeUpdated } = updated as any;
    return NextResponse.json({ ok: true, profileDoc: safeUpdated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Profile update failed' }, { status: 500 });
  }
}
