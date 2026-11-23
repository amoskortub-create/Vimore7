import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { getAdminUsers } from '@/lib/appwrite-server';
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  extractSessionCookie,
} from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim() || 'ViMore User';

    if (!email || !password || password.length < 8) {
      return NextResponse.json(
        { error: 'Valid email and password (min 8 chars) are required.' },
        { status: 400 }
      );
    }

    const users = getAdminUsers();
    const created = await users.create(ID.unique(), email, undefined, password, name);

    const sessionRes = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    const sessionData = await sessionRes.json().catch(() => ({}));
    const cookieSecret = extractSessionCookie(sessionRes.headers.get('set-cookie'));
    const secret = cookieSecret || String(sessionData?.secret || '');

    if (!sessionRes.ok || !secret) {
      await users.delete(created.$id).catch(() => {});
      return NextResponse.json(
        { error: sessionData?.message || 'Could not establish a session for the new account.' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      userId: created.$id,
      email: created.email,
      secret,
    });

    response.cookies.set(`a_session_${APPWRITE_PROJECT_ID}`, secret, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err: any) {
    const code = Number(err?.code) || 500;
    return NextResponse.json(
      { error: err?.message || 'Registration failed.' },
      { status: code >= 400 && code < 600 ? code : 500 }
    );
  }
}
