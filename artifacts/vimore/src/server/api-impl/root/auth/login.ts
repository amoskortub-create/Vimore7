import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookieExpiresAt, getSessionCookieMaxAge } from '@/lib/session-cookie';
import { Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';

const ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1'
).replace(/\/$/, '');
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

/**
 * Server-side login — proxies the credential check directly to Appwrite's
 * REST API so it is a server-to-server call with no CORS / platform-domain
 * restrictions. The client SDK path suffers from "general_unauthorized_scope"
 * when the Replit preview domain is not registered as an Appwrite platform.
 *
 * Appwrite 1.6 no longer returns the session secret in the JSON body when
 * called server-to-server. Instead it sets a Set-Cookie header whose value is
 * a base64-encoded JSON { id, secret }. We extract that cookie value and
 * return it as `secret` so the client can store it in cookieFallback and send
 * it back as X-Appwrite-Session on every authenticated API call.
 */

/**
 * Extract the Appwrite session cookie value from a Set-Cookie header string.
 * The cookie value is a base64-encoded JSON { id, secret } that Appwrite
 * accepts as X-Appwrite-Session for subsequent requests.
 */
function getSafeDiagnostic(err: any): { code: number | null; type: string | null } {
  const code = Number.isInteger(err?.code) ? err.code : null;
  const type = typeof err?.type === 'string' && /^[a-z0-9_]{1,64}$/.test(err.type) ? err.type : null;
  return { code, type };
}

function extractSessionCookie(setCookieHeader: string | null, projectId: string): string {
  if (!setCookieHeader) return '';
  const pattern = new RegExp(`a_session_${projectId}=([^;,\\s]+)`);
  const match = setCookieHeader.match(pattern);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawIdentifier = typeof body.identifier === 'string'
      ? body.identifier.trim()
      : typeof body.email === 'string' ? body.email.trim() : '';
    const password = body.password;

    if (!rawIdentifier || !password) {
      return NextResponse.json({ error: 'identifier and password are required' }, { status: 400 });
    }

    const isPhone = !rawIdentifier.includes('@') && /^[+\d][\d\s\-().]{5,}$/.test(rawIdentifier);
    let email: string;
    if (isPhone) {
      const normalizedPhone = rawIdentifier.replace(/[\s\-().]/g, '');
      let matchedEmail: unknown;
      try {
        const result = await getAdminDatabases().listDocuments(DATABASE_ID, 'users', [
          Query.equal('phone', normalizedPhone),
          Query.limit(1),
        ]);
        matchedEmail = result.documents[0]?.email;
      } catch (err: any) {
        const diagnostic = getSafeDiagnostic(err);
        console.error('[auth/login:phone-lookup]', diagnostic);
        return NextResponse.json(
          { error: 'Phone lookup failed.', diagnostic },
          { status: 500 },
        );
      }

      if (typeof matchedEmail !== 'string' || !matchedEmail.includes('@')) {
        return NextResponse.json({ error: 'No account found with that phone number.' }, { status: 404 });
      }
      email = matchedEmail;
    } else {
      email = rawIdentifier.includes('@') ? rawIdentifier : `${rawIdentifier}@vimore.cfd`;
    }

    // Direct server → Appwrite call — no platform check, no CORS.
    // Note: do NOT send X-Appwrite-Response-Format: 1.0.0 — that header
    // causes Appwrite to omit the Set-Cookie header we need to extract the session.
    const res = await fetch(`${ENDPOINT}/account/sessions/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': PROJECT_ID,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data?.message || 'Invalid credentials.',
          code: typeof data?.code === 'number' ? data.code : res.status,
          type: typeof data?.type === 'string' ? data.type : undefined,
        },
        { status: res.status }
      );
    }

    // Appwrite 1.6+: session secret comes via Set-Cookie, not data.secret.
    // Fall back to data.secret for forward-compatibility if a future version restores it.
    const secret =
      (typeof data.secret === 'string' && data.secret) ||
      extractSessionCookie(res.headers.get('set-cookie'), PROJECT_ID);

    if (!secret) {
      console.error('[auth/login] Appwrite returned no session secret');
      return NextResponse.json(
        { error: 'Login succeeded but the session could not be saved. Please try again.' },
        { status: 502 },
      );
    }

    const response = NextResponse.json({
      sessionId: data.$id,
      secret,
      userId: data.userId,
      email,
      expire: data.expire,
    });
    // The Android WebView may recreate its JavaScript context or lose
    // localStorage between launches. A same-origin cookie is persisted by
    // Capacitor's cookie store and is also understood by session.ts.
    response.cookies.set(`a_session_${PROJECT_ID}`, secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: getSessionCookieExpiresAt(),
      maxAge: getSessionCookieMaxAge(data.expire),
    });
    return response;
  } catch (err: any) {
    console.error('[auth/login]', err);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}
