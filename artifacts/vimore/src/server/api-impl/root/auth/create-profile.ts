import { NextRequest, NextResponse } from 'next/server';
import { Query, ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 401 }, { status: 401 });
    }

    const db = getAdminDatabases();
    if (session.profileDoc) {
      return NextResponse.json({
        ok: true,
        role: String(session.profileDoc.role || 'USER'),
        profileDoc: session.profileDoc,
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || session.authUser.email || '').trim().toLowerCase();
    const emailLocal = (email.split('@')[0] || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, '');

    let username = String(body.username || emailLocal || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, '')
      .slice(0, 28);
    if (!username) username = `user_${session.authUser.$id.slice(0, 8)}`;

    const existingUsername = await db.listDocuments(DATABASE_ID, COL.USERS, [
      Query.equal('username', username),
      Query.limit(1),
    ]);
    if (
      existingUsername.documents.length > 0 &&
      existingUsername.documents[0].$id !== session.authUser.$id
    ) {
      if (emailLocal && emailLocal !== username) {
        const alt = await db.listDocuments(DATABASE_ID, COL.USERS, [
          Query.equal('username', emailLocal),
          Query.limit(1),
        ]);
        username =
          alt.documents.length === 0
            ? emailLocal
            : `${username.slice(0, 20)}.${session.authUser.$id.slice(-4)}`;
      } else {
        username = `${username.slice(0, 20)}.${session.authUser.$id.slice(-4)}`;
      }
    }

    const referralCode =
      String(body.referralCode || body.referral_code || '').trim() ||
      `VM${username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}${Math.random()
        .toString(36)
        .slice(2, 5)
        .toUpperCase()}`;

    const now = new Date().toISOString();
    const phone = body.phone ? String(body.phone).trim() : '';

    const profileData: Record<string, any> = {
      name: String(body.name || session.authUser.name || username).trim(),
      username,
      email,
      ...(phone ? { phone } : {}),
      nationality: String(body.nationality || '').trim(),
      date_of_birth: String(body.dob || body.date_of_birth || '').trim(),
      gender: String(body.gender || '').trim(),
      referral_code: referralCode,
      referral_count: 0,
      role: 'USER',
      diamond_balance: 0,
      gold_balance: 0,
      star_balance: 0,
      followers_count: 0,
      following_count: 0,
      friends_count: 0,
      posts_count: 0,
      is_verified: false,
      has_ever_been_verified: false,
      is_online: true,
      last_seen_at: now,
      join_date: now,
    };

    const profileDoc = await db.createDocument(
      DATABASE_ID,
      COL.USERS,
      session.authUser.$id,
      profileData
    );

    const referredByCode = String(body.referredBy || '').trim();
    if (referredByCode) {
      try {
        const referrers = await db.listDocuments(DATABASE_ID, COL.USERS, [
          Query.equal('username', referredByCode.replace(/^@/, '')),
          Query.limit(1),
        ]);
        if (referrers.documents[0]) {
          await db.createDocument(DATABASE_ID, COL.REFERRALS, ID.unique(), {
            referrer_id: referrers.documents[0].$id,
            referee_id: session.authUser.$id,
            referral_code: referralCode,
            status: 'COMPLETED',
          });
        }
      } catch {
        // non-fatal
      }
    }

    return NextResponse.json({
      ok: true,
      role: 'USER',
      profileDoc,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Profile creation failed.', code: Number(err?.code) || 500 },
      { status: 500 }
    );
  }
}
