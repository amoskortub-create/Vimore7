/**
 * authFetch — drop-in fetch wrapper that authenticates Next.js API calls.
 *
 * Why this exists:
 * The Appwrite web SDK v14 stores sessions in localStorage under the key
 * "cookieFallback" as a JSON object: { "a_session_{projectId}": "SESSION_VALUE" }.
 * It sends this to the Appwrite server as the "X-Fallback-Cookies" header.
 * But our Next.js API routes are on a DIFFERENT path/domain from the Appwrite
 * server, so req.cookies is always empty and JWT creation requires an extra
 * network round-trip that can fail.
 *
 * Solution: read the session value directly from localStorage and send it as
 * "X-Appwrite-Session" — a custom header our session.ts reads via client.setSession().
 * JWT is attempted in parallel as a secondary credential.
 */

import { clearApiResponseCache, fetchCachedApiResponse } from './api-response-cache';

const PROJECT_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

const COOKIE_KEY = 'cookieFallback';
const SESSION_KEY = `a_session_${PROJECT_ID}`;

/** Synchronously read the Appwrite session value from localStorage. */
export function getSessionFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.[SESSION_KEY] ?? null;
  } catch {
    return null;
  }
}

export function storeSessionInStorage(session: string): void {
  if (typeof window === 'undefined' || !session) return;
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    const fallback = raw ? JSON.parse(raw) : {};
    fallback[SESSION_KEY] = session;
    localStorage.setItem(COOKIE_KEY, JSON.stringify(fallback));
  } catch {}
}

/** Attempt to create an Appwrite JWT (short-lived, 15 min). Cached 10 min. */
let _jwtCache: { token: string; exp: number } | null = null;
async function tryGetJwt(): Promise<string | null> {
  try {
    if (_jwtCache && Date.now() < _jwtCache.exp) return _jwtCache.token;
    // Lazy import to avoid loading appwrite module in server context
    const { account } = await import('./appwrite');
    const result = await account.createJWT();
    _jwtCache = { token: result.jwt, exp: Date.now() + 10 * 60 * 1000 };
    return result.jwt;
  } catch {
    _jwtCache = null;
    return null;
  }
}

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers as HeadersInit | undefined);

  // Primary: direct session from localStorage (synchronous, no network call needed)
  const session = getSessionFromStorage();
  if (session) {
    headers.set('X-Appwrite-Session', session);
  }

  const requestUrl = typeof window !== 'undefined' ? new URL(url, window.location.origin) : null;
  const bypassPaths = [
    '/api/auth/', '/api/presence', '/api/notifications', '/api/messages',
    '/api/calls', '/api/admin/', '/api/payment/', '/api/withdraw',
    '/api/monetization/', '/api/push/', '/api/user/activity',
  ];
  const canCache = Boolean(
    typeof window !== 'undefined' &&
    (options.method === undefined || options.method.toUpperCase() === 'GET') &&
    options.cache === undefined && Boolean(getSessionFromStorage()) &&
    requestUrl?.origin === window.location.origin &&
    requestUrl.pathname.startsWith('/api/') &&
    !bypassPaths.some((path) => requestUrl.pathname.startsWith(path))
  );

  const fetchFresh = async () => {
    // The direct session is sufficient; only request a JWT when it is absent.
    if (!session) {
      const jwt = await tryGetJwt();
      if (jwt) headers.set('Authorization', `Bearer ${jwt}`);
    }

    // Keep the browser/WebView HTTP cache off; eligible reads use IndexedDB above.
    return fetch(url, {
      ...options,
      headers,
      cache: options.cache ?? 'no-store',
    });
  };

  if (canCache) {
    const session = getSessionFromStorage();
    if (session) return fetchCachedApiResponse(url, session, fetchFresh);
  }

  const response = await fetchFresh();
  if (response.ok && options.method && options.method.toUpperCase() !== 'GET') {
    await clearApiResponseCache();
  }
  return response;
}

/** Call on logout to clear the JWT cache. */
export function clearJwtCache() {
  _jwtCache = null;
}
