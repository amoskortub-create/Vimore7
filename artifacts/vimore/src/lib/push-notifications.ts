'use client';

import { authFetch } from './auth-fetch';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidPublicKey(): Promise<string | null> {
  const inlineKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (inlineKey) return inlineKey;
  try {
    const res = await fetch('/api/push/vapid-key', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data?.publicKey === 'string' && data.publicKey ? data.publicKey : null;
  } catch {
    return null;
  }
}

async function getReadyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (!existing) {
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    }
    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 6000));
    return await Promise.race([readyPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) return null;

  const registration = await getReadyServiceWorker();
  if (!registration?.pushManager) return null;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });
  }

  const subJson = subscription.toJSON();
  const res = await authFetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subJson }),
  });

  if (!res.ok) {
    throw new Error(`Push subscription sync failed (${res.status})`);
  }

  return subscription.endpoint;
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) await sub.unsubscribe().catch(() => {});
    }
  } catch {}
  await authFetch('/api/push/unsubscribe', { method: 'POST' }).catch(() => {});
}
