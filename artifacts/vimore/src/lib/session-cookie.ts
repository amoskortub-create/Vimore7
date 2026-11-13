export const SESSION_COOKIE_MAX_AGE_SECONDS = 7776000;

export function getSessionCookieMaxAge(_expire: unknown): number {
  return SESSION_COOKIE_MAX_AGE_SECONDS;
}

export function getSessionCookieExpiresAt(): Date {
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
}
