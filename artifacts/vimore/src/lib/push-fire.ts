/**
 * Fire-and-forget helper: triggers Web Push and native FCM delivery to the
 * target user's registered devices.
 */
export interface FirePushOptions {
  userId?: string;
  userIds?: string[];
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  image?: string;
  tag?: string;
  badgeCount?: number;
  requireInteraction?: boolean;
  renotify?: boolean;
  data?: Record<string, any>;
  actions?: { action: string; title: string; icon?: string; type?: 'button' | 'text'; placeholder?: string }[];
}

export function firePush(opts: FirePushOptions): void {
  if (typeof window === 'undefined') return;
  const targets = opts.userIds && opts.userIds.length ? opts.userIds : opts.userId ? [opts.userId] : [];
  if (!targets.length || !opts.title) return;

  const payload = {
    title: opts.title,
    body: opts.body,
    url: opts.url,
    icon: opts.icon,
    image: opts.image,
    tag: opts.tag,
    badgeCount: opts.badgeCount,
    requireInteraction: opts.requireInteraction,
    renotify: opts.renotify,
    data: opts.data,
    actions: opts.actions,
  };

  // Use sendBeacon when possible so the request survives navigation
  try {
    const blob = new Blob([JSON.stringify({ userIds: targets, payload })], {
      type: 'application/json',
    });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/push/send', blob)) return;
  } catch {}

  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: targets, payload }),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) {
      console.error(`[push] delivery request failed (${response.status})`);
    }
  }).catch((error: unknown) => {
    console.error('[push] delivery request failed:', error);
  });
}
