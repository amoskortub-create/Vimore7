import 'server-only';
import { Client, Account } from 'node-appwrite';
import type { NextRequest } from 'next/server';

const ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1'
).replace(/\/$/, '');
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

export interface SessionUser {
  $id: string;
  email: string;
  name: string;
  emailVerification: boolean;
  $createdAt: string;
}

function readCookieSession(req: Request | NextRequest): string | null {
  if ('cookies' in req && typeof req.cookies?.get === 'function') {
    const val = req.cookies.get(`a_session_${PROJECT_ID}`)?.value;
    if (val) return val;
  }
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  const escaped = PROJECT_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)a_session_${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getSessionUser(req: Request | NextRequest): Promise<SessionUser | null> {
  const sessionHeader = req.headers.get('x-appwrite-session')?.trim();
  const authHeader = req.headers.get('authorization')?.trim();
  const jwt = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const cookieSession = readCookieSession(req);

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);

  if (sessionHeader) {
    client.setSession(sessionHeader);
  } else if (jwt) {
    client.setJWT(jwt);
  } else if (cookieSession) {
    client.setSession(cookieSession);
  } else {
    return null;
  }

  try {
    const account = new Account(client);
    const user = await account.get();
    return {
      $id: user.$id,
      email: user.email,
      name: user.name,
      emailVerification: user.emailVerification,
      $createdAt: user.$createdAt,
    };
  } catch {
    return null;
  }
}

export function extractRequestSessionToken(req: Request | NextRequest): string | null {
  return (
    req.headers.get('x-appwrite-session')?.trim() ||
    readCookieSession(req) ||
    null
  );
}
