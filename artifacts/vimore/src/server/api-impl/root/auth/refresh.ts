import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

const ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1'
).replace(/\/$/, '');
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

function extractSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return '';
  const match = setCookieHeader.match(new RegExp(`a_session_${PROJECT_ID}=([^;,\\s]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function getSessionMaxAge(expire: unknown): number {
  if (typeof expire === 'string') {
    const remainingSeconds = Math.floor((Date.parse(expire) - Date.now()) / 1000);
    if (Number.isFinite(remainingSeconds) && remainingSeconds > 0) return remainingSeconds;
  }
  return 365 * 24 * 60 * 60;
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
      maxAge: getSessionMaxAge(data.expire),
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Session refresh failed.' }, { status: 502 });
  }
}