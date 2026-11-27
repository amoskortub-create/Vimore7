const DEFAULT_APK_DOWNLOAD_URL = '/downloads/vimore.apk';

export function getApkDownloadUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL?.trim();
  if (!configured) return DEFAULT_APK_DOWNLOAD_URL;
  if (configured.startsWith('/')) return configured;

  try {
    const parsed = new URL(configured);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Fall back to the canonical local APK path if env URL is invalid
  }

  return DEFAULT_APK_DOWNLOAD_URL;
}

export function getAndroidBrowserIntentUrl(apkUrl: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const resolved = new URL(apkUrl, window.location.origin);
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      return null;
    }
    const scheme = resolved.protocol.replace(':', '');
    return `intent://${resolved.host}${resolved.pathname}${resolved.search}#Intent;scheme=${scheme};action=android.intent.action.VIEW;end`;
  } catch {
    return null;
  }
}
