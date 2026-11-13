import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookieExpiresAt, getSessionCookieMaxAge } from '@/lib/session-cookie';

const ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1'
).replace(/\/$/, '');
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

function extractSessionCookie(setCookieHeader: string | null, projectId: string): string {
  if (!setCookieHeader) return '';
  const pattern = new RegExp('a_session_' + projectId + '=([^;,\\s]+)');
  const match = setCookieHeader.match(pattern);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'email, password and name are required' }, { status: 400 });
    }

    // Account.create is a public Appwrite client endpoint; it avoids requiring
    // the server API key to carry users.write. The origin is the canonical web
    // platform that is registered for this Appwrite project.
    const accountRes = await fetch(ENDPOINT + '/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': PROJECT_ID,
        Origin: 'https://www.vimore.cfd',
      },
      body: JSON.stringify({ userId: randomUUID(), email, password, name }),
    });
    const accountData = await accountRes.json().catch(() => ({}));
    if (!accountRes.ok) {
      return NextResponse.json(
        { error: accountData?.message || 'Failed to create account.' },
        { status: accountRes.status }
      );
    }

    const userId = accountData.$id;
    if (!userId) {
      return NextResponse.json({ error: 'Appwrite created no account ID.' }, { status: 502 });
    }

    // Create the email/password session server-to-server.
    const sessionRes = await fetch(ENDPOINT + '/account/sessions/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': PROJECT_ID,
      },
      body: JSON.stringify({ email, password }),
    });
    const sessionData = await sessionRes.json().catch(() => ({}));

    if (!sessionRes.ok) {
      return NextResponse.json(
        { error: sessionData?.message || 'Account created but sign-in failed. Please log in.', userId },
        { status: sessionRes.status }
      );
    }

    const secret =
      (typeof sessionData.secret === 'string' && sessionData.secret) ||
      extractSessionCookie(sessionRes.headers.get('set-cookie'), PROJECT_ID);

    if (!secret) {
      console.error('[auth/register] Appwrite returned no session secret');
      return NextResponse.json(
        { error: 'Account created but the session could not be saved. Please log in again.', userId },
        { status: 502 },
      );
    }

    const response = NextResponse.json({
      userId,
      sessionId: sessionData.$id,
      secret,
      expire: sessionData.expire,
    });
    response.cookies.set('a_session_' + PROJECT_ID, secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: getSessionCookieExpiresAt(),
      maxAge: getSessionCookieMaxAge(sessionData.expire),
    });
    return response;
  } catch (err: any) {
    console.error('[auth/register]', err);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
