export const SESSION_COOKIE_MAX_AGE_SECONDS = 5 * 30 * 24 * 60 * 60;

export function getSessionCookieMaxAge(expire: unknown): number {
  if (typeof expire !== 'string') return SESSION_COOKIE_MAX_AGE_SECONDS;

  const expireTime = Date.parse(expire);
  if (!Number.isFinite(expireTime)) return SESSION_COOKIE_MAX_AGE_SECONDS;

  const remainingSeconds = Math.floor((expireTime - Date.now()) / 1000);
  return Math.max(0, Math.min(SESSION_COOKIE_MAX_AGE_SECONDS, remainingSeconds));
}
