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
 * "X-Appwrite-Session" — a custom header our session.ts validates with Appwrite.
 */

import { clearApiResponseCache, fetchCachedApiResponse } from './api-response-cache';

let deadSessionCleanupPromise: Promise<void> | null = null;

const PROJECT_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

const COOKIE_KEY = 'cookieFallback';
const SESSION_KEY = `a_session_${PROJECT_ID}`;
const AUTH_REDIRECT_KEY = 'vimore_auth_expired_redirected';

function isAuthPage(): boolean {
  if (typeof window === 'undefined') return true;
  const path = window.location.pathname;
  return path === '/login' || path === '/signup' || path.startsWith('/auth/');
}

export function clearAuthRedirectState(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(AUTH_REDIRECT_KEY); } catch {}
}

export function redirectToLoginOnce(): void {
  if (typeof window === 'undefined' || isAuthPage()) return;
  try {
    if (sessionStorage.getItem(AUTH_REDIRECT_KEY) === '1') return;
    sessionStorage.setItem(AUTH_REDIRECT_KEY, '1');
  } catch {}
  window.location.replace('/login?reason=session-expired');
}

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

export function isUnauthorizedSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, status, type } = error as { code?: unknown; status?: unknown; type?: unknown };
  return code === 401 || status === 401 || type === 'user_session_not_found';
}

export function clearStoredAppwriteSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      localStorage.removeItem(COOKIE_KEY);
      return;
    }
    delete stored[SESSION_KEY];
    if (Object.keys(stored).length > 0) localStorage.setItem(COOKIE_KEY, JSON.stringify(stored));
    else localStorage.removeItem(COOKIE_KEY);
  } catch {
    localStorage.removeItem(COOKIE_KEY);
  }
}

export async function clearDeadAppwriteSessionOnce(deleteCurrentSession: () => Promise<unknown>): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!deadSessionCleanupPromise) {
    deadSessionCleanupPromise = (async () => {
      try { await deleteCurrentSession(); } catch { /* expired session may already be gone */ }
      clearStoredAppwriteSession();
      try {
        await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store', credentials: 'same-origin' });
      } catch { /* the local token is still cleared; retrying login creates a fresh session */ }
    })();
  }
  await deadSessionCleanupPromise;
}

export function resetDeadAppwriteSessionCleanup(): void {
  deadSessionCleanupPromise = null;
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
    // Keep the browser/WebView HTTP cache off; eligible reads use IndexedDB above.
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: options.credentials ?? 'same-origin',
      cache: options.cache ?? 'no-store',
    });

    if (typeof window !== 'undefined' && requestUrl?.origin === window.location.origin) {
      if (response.status === 401) {
        redirectToLoginOnce();
      } else if (response.ok && requestUrl.pathname === '/api/auth/me') {
        clearAuthRedirectState();
      }
    }

    return response;
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
