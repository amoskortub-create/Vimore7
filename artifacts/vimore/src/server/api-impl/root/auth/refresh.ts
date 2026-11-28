import { NextRequest, NextResponse } from 'next/server';
import { extractRequestSessionToken } from '@/lib/session';
import { APPWRITE_PROJECT_ID, getRawAuthenticatedProfile, isAccountDeleted } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  const token = extractRequestSessionToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await getRawAuthenticatedProfile(req);
  if (!session) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  if (isAccountDeleted(session.profileDoc)) {
    const res = NextResponse.json({ error: 'Account deleted' }, { status: 403 });
    res.cookies.set(`a_session_${APPWRITE_PROJECT_ID}`, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return res;
  }

  const response = NextResponse.json({
    ok: true,
    userId: session.authUser.$id,
    secret: token,
  });

  response.cookies.set(`a_session_${APPWRITE_PROJECT_ID}`, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
