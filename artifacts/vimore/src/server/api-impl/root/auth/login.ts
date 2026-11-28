import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases, getAdminUsers } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  extractSessionCookie,
  getClientIp,
  logSecurityEvent,
} from '@/lib/server-helpers';

function buildPhoneCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const compact = trimmed.replace(/[\s\-()]/g, '');
  const digitsOnly = compact.replace(/^\+/, '');
  const candidates = new Set<string>([trimmed, compact, digitsOnly]);

  if (compact.startsWith('+')) {
    candidates.add(compact.slice(1));
  } else if (digitsOnly.length >= 6) {
    candidates.add(`+${digitsOnly}`);
  }

  // Liberian (+231) local <-> E.164 variants (e.g. 0778451835 <-> +231778451835 <-> 778451835)
  if (digitsOnly.startsWith('0') && digitsOnly.length >= 9) {
    const local = digitsOnly.slice(1);
    candidates.add(local);
    candidates.add(`231${local}`);
    candidates.add(`+231${local}`);
  } else if (digitsOnly.startsWith('231') && digitsOnly.length >= 11) {
    const local = digitsOnly.slice(3);
    candidates.add(`0${local}`);
    candidates.add(local);
    candidates.add(`+${digitsOnly}`);
  } else if (/^[578]\d{7,8}$/.test(digitsOnly)) {
    candidates.add(`0${digitsOnly}`);
    candidates.add(`231${digitsOnly}`);
    candidates.add(`+231${digitsOnly}`);
  }

  return Array.from(candidates).filter(Boolean);
}

async function resolveEmailFromIdentifier(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  const db = getAdminDatabases();
  const looksLikePhone = /^[+\d][\d\s\-()]{5,}$/.test(trimmed);

  if (looksLikePhone) {
    const candidates = buildPhoneCandidates(trimmed);
    try {
      const res = await db.listDocuments(DATABASE_ID, COL.USERS, [
        Query.equal('phone', candidates),
        Query.limit(1),
      ]);
      if (res.documents[0]?.email) {
        return String(res.documents[0].email).trim().toLowerCase();
      }
    } catch {
      // Fall through to individual/auth user lookup
    }

    for (const candidate of candidates) {
      try {
        const users = getAdminUsers();
        const authList = await users.list([Query.equal('phone', candidate), Query.limit(1)]);
        if (authList.users[0]?.email) {
          return String(authList.users[0].email).trim().toLowerCase();
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  const cleanUsername = trimmed.replace(/^@/, '').toLowerCase();
  try {
    const res = await db.listDocuments(DATABASE_ID, COL.USERS, [
      Query.equal('username', cleanUsername),
      Query.limit(1),
    ]);
    if (res.documents[0]?.email) {
      return String(res.documents[0].email).trim().toLowerCase();
    }
  } catch {
    // ignore
  }

  return `${cleanUsername}@vimore.cfd`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawIdentifier = String(body.email || body.identifier || '').trim();
    const password = String(body.password || '');

    if (!rawIdentifier || !password) {
      return NextResponse.json(
        { error: 'ViMore ID, phone number, and password are required.', code: 400 },
        { status: 400 }
      );
    }

    const resolvedEmail = await resolveEmailFromIdentifier(rawIdentifier);
    if (!resolvedEmail) {
      return NextResponse.json(
        {
          error: 'No account was found with that phone number or ViMore ID.',
          code: 404,
          type: 'user_not_found',
        },
        { status: 401 }
      );
    }

    const res = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      },
      body: JSON.stringify({ email: resolvedEmail, password }),
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      await logSecurityEvent({
        event_type: 'LOGIN_FAILED',
        severity: 'WARNING',
        username: resolvedEmail,
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent') || '',
        details: data?.message || `HTTP ${res.status}`,
      });
      return NextResponse.json(
        {
          error: data?.message || 'Invalid credentials.',
          code: Number(data?.code) || res.status,
          type: data?.type,
        },
        { status: res.status === 429 ? 429 : 401 }
      );
    }

    const cookieSecret = extractSessionCookie(res.headers.get('set-cookie'));
    const secret = cookieSecret || String(data?.secret || '');
    const userId = String(data?.userId || '');

    if (!secret || !userId) {
      return NextResponse.json(
        { error: 'Appwrite did not return an authenticated session.', code: 500 },
        { status: 500 }
      );
    }

    try {
      const db = getAdminDatabases();
      const profileDoc = await db.getDocument(DATABASE_ID, COL.USERS, userId);
      if (profileDoc?.is_deleted === true || String(profileDoc?.status || '').toLowerCase() === 'deleted') {
        await fetch(`${APPWRITE_ENDPOINT}/account/sessions/current`, {
          method: 'DELETE',
          headers: {
            'X-Appwrite-Project': APPWRITE_PROJECT_ID,
            'X-Appwrite-Session': secret,
          },
          cache: 'no-store',
        }).catch(() => {});
        return NextResponse.json(
          {
            error: 'This account has been deleted. Your access was removed and all data is scheduled for permanent deletion after 90 days.',
            code: 403,
            type: 'account_deleted',
          },
          { status: 403 }
        );
      }
    } catch {
      // profile may not exist yet for incomplete signups; proceed
    }

    const response = NextResponse.json({
      ok: true,
      secret,
      userId,
      email: resolvedEmail,
      expire: data?.expire,
    });

    response.cookies.set(`a_session_${APPWRITE_PROJECT_ID}`, secret, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Login failed.', code: 500 }, { status: 500 });
  }
}
