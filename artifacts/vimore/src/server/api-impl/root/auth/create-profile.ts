import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, getAdminUsers, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';

const COL_USERS = 'users';

export async function POST(req: NextRequest) {
  try {
    // Verify the caller is an authenticated Appwrite user
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = sessionUser.userId;
    const db = getAdminDatabases();

    // Idempotent: if the profile document already exists, return it
    try {
      const existing = await db.getDocument(DATABASE_ID, COL_USERS, userId);
      return NextResponse.json({ success: true, role: existing.role, existing: true });
    } catch {
      // Document doesn't exist yet — continue to create it
    }

    const body = await req.json();
    const {
      name, username, email, phone, nationality, dob, gender,
      referralCode,
    } = body;

    const bootstrapAdminId = process.env.SUPER_ADMIN_USER_ID?.trim();
    const assignedRole = bootstrapAdminId === userId ? 'SUPER' : 'USER';

    const docData: Record<string, any> = {
      name,
      username,
      email,
      bio: '',
      category: '',
      is_verified: false,
      has_ever_been_verified: false,
      followers_count: 0,
      following_count: 0,
      friends_count: 0,
      posts_count: 0,
      gold_balance: 0,
      diamond_balance: 0,
      credit_balance: 0,
      star_balance: 0,
      role: assignedRole,
      join_date: new Date().toISOString(),
      nationality: nationality || '',
      date_of_birth: dob || '',
      gender: gender || '',
      referral_code: referralCode || '',
      referral_count: 0,
      language: 'en',
    };

    if (phone) {
      docData.phone = phone.replace(/[\s\-().]/g, '');
    }

    await db.createDocument(DATABASE_ID, COL_USERS, userId, docData);

    return NextResponse.json({ success: true, role: assignedRole });
  } catch (err: any) {
    console.error('[create-profile]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to create user profile.' },
      { status: 500 }
    );
  }
}
