import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedProfile(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    authUser: session.authUser,
    profileDoc: session.profileDoc,
  });
}
