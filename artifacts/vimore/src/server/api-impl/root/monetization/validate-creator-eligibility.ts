import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { validateCreatorEligibility } from '@/lib/ld-monetization';

const MIN_FOLLOWERS = 1000;

async function checkEligibility(creatorUserId: string, suppliedCount?: number) {
  let followerCount = Number(suppliedCount ?? 0);
  if (creatorUserId) {
    const db = getAdminDatabases();
    const doc = await db.getDocument(DATABASE_ID, COL.USERS, creatorUserId);
    followerCount = Number(doc.followers_count || 0);
  }
  const eligible = validateCreatorEligibility(followerCount, MIN_FOLLOWERS);
  return { eligible, followerCount, minimumFollowers: MIN_FOLLOWERS };
}

export async function GET(req: NextRequest) {
  try {
    const creatorUserId = req.nextUrl.searchParams.get('creatorUserId') || '';
    const count = req.nextUrl.searchParams.get('followerCount');
    const result = await checkEligibility(creatorUserId, count ? Number(count) : undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Eligibility check failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await checkEligibility(
      String(body.creatorUserId || ''),
      body.followerCount !== undefined ? Number(body.followerCount) : undefined
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Eligibility check failed' }, { status: 500 });
  }
}
