import { NextRequest, NextResponse } from 'next/server';
import { extractRequestSessionToken, getSessionUser } from '@/lib/session';
import { APPWRITE_PROJECT_ID } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  const token = extractRequestSessionToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    userId: user.$id,
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
