import { getAdminDatabases, DATABASE_ID } from './appwrite-server';
import type { NextRequest } from 'next/server';

const ENDPOINT = (process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1').replace(/\/$/, '');
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

export interface SessionUser {
  userId: string;
  role: string | null;
  authUser: {
    $id: string;
    email: string;
    name: string;
    emailVerification: boolean;
    $createdAt: string;
  };
}

/** Validate the browser session with Appwrite's REST endpoint. */
async function resolveUser(authHeader: Record<string, string>): Promise<SessionUser | null> {
  try {
    const response = await fetch(ENDPOINT + '/account', {
      method: 'GET',
      headers: { 'X-Appwrite-Project': PROJECT_ID, ...authHeader },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.warn('[session] Appwrite rejected the supplied session (HTTP ' + response.status + ')');
      return null;
    }

    const accountUser = await response.json();
    if (typeof accountUser?.$id !== 'string' || !accountUser.$id) return null;

    let role: string | null = null;
    try {
      const userDoc = await getAdminDatabases().getDocument(DATABASE_ID, 'users', accountUser.$id);
      role = userDoc?.role ?? null;
    } catch {
      // Session validity must not depend on the optional admin role lookup.
    }

    return {
      userId: accountUser.$id,
      role,
      authUser: {
        $id: accountUser.$id,
        email: typeof accountUser.email === 'string' ? accountUser.email : '',
        name: typeof accountUser.name === 'string' ? accountUser.name : '',
        emailVerification: Boolean(accountUser.emailVerification),
        $createdAt: typeof accountUser.$createdAt === 'string' ? accountUser.$createdAt : '',
      },
    };
  } catch (err: any) {
    console.error('[session] Appwrite account validation failed:', err?.message ?? err);
    return null;
  }
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const sessionHeader = req.headers.get('x-appwrite-session');
  if (sessionHeader) {
    const user = await resolveUser({ 'X-Appwrite-Session': sessionHeader });
    if (user) return user;
  }

  const authorization = req.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const user = await resolveUser({ Authorization: authorization });
    if (user) return user;
  }

  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';
  const cookieSession = req.cookies.get('a_session_' + projectId)?.value
    || req.cookies.get('a_session_' + projectId + '_legacy')?.value;
  if (cookieSession) {
    const user = await resolveUser({ 'X-Appwrite-Session': cookieSession });
    if (user) return user;
  }

  return null;
}
