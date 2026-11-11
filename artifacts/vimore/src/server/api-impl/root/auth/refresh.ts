import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookieMaxAge } from '@/lib/session-cookie';

const ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1'
).replace(/\/$/, '');
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

function extractSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return '';
  const match = setCookieHeader.match(new RegExp(`a_session_${PROJECT_ID}=([^;,\\s]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

export async function POST(req: NextRequest) {
  const session = req.headers.get('x-appwrite-session') ||
    req.cookies.get(`a_session_${PROJECT_ID}`)?.value;
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const upstream = await fetch(`${ENDPOINT}/account/sessions/current`, {
      method: 'PATCH',
      headers: {
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Session': session,
      },
      cache: 'no-store',
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { error: upstream.status === 401 ? 'Unauthorized' : 'Session refresh failed.' },
        { status: upstream.status === 401 ? 401 : 502 },
      );
    }

    const refreshedSession =
      (typeof data.secret === 'string' && data.secret) ||
      extractSessionCookie(upstream.headers.get('set-cookie')) ||
      session;
    const response = NextResponse.json(
      { secret: refreshedSession, expire: data.expire ?? null },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
    response.cookies.set(`a_session_${PROJECT_ID}`, refreshedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: getSessionCookieMaxAge(data.expire),
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Session refresh failed.' }, { status: 502 });
  }
}