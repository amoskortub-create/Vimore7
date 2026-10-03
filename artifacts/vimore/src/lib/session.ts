import 'server-only';
import { Client, Account } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from './appwrite-server';

const ENDPOINT =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1';
const PROJECT_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

export interface SessionUser {
  userId: string;
  role: string | null;
}

// ─── credential extractors ─────────────────────────────────────────────────

/** Primary: direct session value sent by authFetch from localStorage. */
function extractSessionHeader(req: Request): string | null {
  return req.headers.get('x-appwrite-session');
}

/** Secondary: Appwrite JWT sent as Authorization: Bearer <jwt>. */
function extractJwt(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/** Legacy: cookie-based session (may work in some deployment setups). */
function extractCookieSession(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = new Map(
    cookieHeader.split(';').map(cookie => {
      const separator = cookie.indexOf('=');
      const name = separator < 0 ? cookie.trim() : cookie.slice(0, separator).trim();
      const value = separator < 0 ? '' : cookie.slice(separator + 1).trim();
      try {
        return [name, decodeURIComponent(value)] as const;
      } catch {
        return [name, value] as const;
      }
    }),
  );
  return cookies.get(`a_session_${PROJECT_ID}`) ||
    cookies.get(`a_session_${PROJECT_ID}_legacy`) ||
    null;
}

// ─── user resolution ───────────────────────────────────────────────────────

async function resolveUser(client: Client): Promise<SessionUser | null> {
  try {
    const account = new Account(client);
    const appwriteUser = await account.get();
    const db = getAdminDatabases();
    let role: string | null = null;
    try {
      const userDoc = await db.getDocument(DATABASE_ID, 'users', appwriteUser.$id);
      role = userDoc?.role ?? null;
    } catch {
      /* user doc not found — treat as no role */
    }
    return { userId: appwriteUser.$id, role };
  } catch (err: any) {
    console.error('[session] resolveUser failed:', err?.message ?? err);
    return null;
  }
}

// ─── main export ───────────────────────────────────────────────────────────

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  // 1. Direct session from localStorage (sent by authFetch as X-Appwrite-Session).
  //    This is the most reliable path — no network round-trip, always fresh.
  const sessionHeader = extractSessionHeader(req);
  if (sessionHeader) {
    const client = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setSession(sessionHeader);
    const user = await resolveUser(client);
    if (user) return user;
  }

  // 2. Appwrite JWT from Authorization: Bearer header.
  const jwt = extractJwt(req);
  if (jwt) {
    const client = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setJWT(jwt);
    const user = await resolveUser(client);
    if (user) return user;
  }

  // 3. Legacy cookie (works if browser sets same-domain cookie).
  const cookieSession = extractCookieSession(req);
  if (cookieSession) {
    const client = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setSession(cookieSession);
    const user = await resolveUser(client);
    if (user) return user;
  }

  return null;
}
