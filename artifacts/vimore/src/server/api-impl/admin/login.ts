import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  ADMIN_ROLES,
  extractSessionCookie,
  logSecurityEvent,
  getClientIp,
  type AdminRole,
} from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawIdentifier = String(body.identifier || '').trim();
    const password = String(body.password || '');

    if (!rawIdentifier || !password) {
      return NextResponse.json({ error: 'Identifier and password are required.' }, { status: 400 });
    }

    const email = rawIdentifier.includes('@') ? rawIdentifier : `${rawIdentifier}@vimore.cfd`;

    const res = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || 'Invalid credentials.' },
        { status: res.status || 401 }
      );
    }

    const secret =
      (typeof data?.secret === 'string' && data.secret) ||
      extractSessionCookie(res.headers.get('set-cookie'), APPWRITE_PROJECT_ID);

    const userId = data?.userId;
    if (!userId || !secret) {
      return NextResponse.json({ error: 'Session creation failed.' }, { status: 401 });
    }

    const db = getAdminDatabases();
    let role = 'USER';
    try {
      const profile = await db.getDocument(DATABASE_ID, COL.USERS, userId);
      role = String(profile.role || 'USER').toUpperCase();
    } catch {
      role = 'USER';
    }

    const authorized = ADMIN_ROLES.includes(role as AdminRole);
    await logSecurityEvent({
      event_type: authorized ? 'ADMIN_LOGIN_SUCCESS' : 'ADMIN_LOGIN_DENIED',
      severity: authorized ? 'INFO' : 'WARNING',
      user_id: userId,
      username: rawIdentifier,
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || '',
      details: authorized ? `Role ${role} signed into Command Core` : `Unauthorized role ${role}`,
    });

    return NextResponse.json({
      authorized,
      session: authorized ? secret : undefined,
      userId,
      role,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Admin login failed.' }, { status: 500 });
  }
}
