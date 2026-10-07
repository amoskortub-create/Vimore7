import { authFetch } from '@/lib/auth-fetch';
import { Capacitor } from '@capacitor/core';

/**
 * Firebase Cloud Messaging helpers for browser push.
 *
 * Usage from a client component:
 *   await subscribeToPush();   // asks permission, gets an FCM token and saves it
 *   await unsubscribeFromPush();
 */

const FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyD9_45zPiEAxV6QByRQSGRMA3pdr3S4C84',
  authDomain: 'studio-1245266398-590b7.firebaseapp.com',
  projectId: 'studio-1245266398-590b7',
  storageBucket: 'studio-1245266398-590b7.firebasestorage.app',
  messagingSenderId: '695712565764',
  appId: '1:695712565764:web:9bac8bfea8208b6cc4c351',
};
const FIREBASE_SDK_VERSION = '12.19.0';
const FIREBASE_VAPID_PUBLIC_KEY =
  'BG1201FP27FxoBbbRZL9AycD-c9zAup66v1r2B0-YKLh2F9FfJyh-Shq61Ffufr-d0_N6qQtpDc-_YcSssanQys';

type FirebaseMessagePayload = {
  notification?: { title?: string; body?: string; image?: string };
  data?: Record<string, string>;
};

type FirebaseMessagingCompat = {
  getToken(options: {
    vapidKey: string;
    serviceWorkerRegistration: ServiceWorkerRegistration;
  }): Promise<string>;
  deleteToken(): Promise<boolean>;
  onMessage(callback: (payload: FirebaseMessagePayload) => void): () => void;
};

type FirebaseCompat = {
  apps: unknown[];
  app(): unknown;
  initializeApp(config: typeof FIREBASE_WEB_CONFIG): unknown;
  messaging: ((app?: unknown) => FirebaseMessagingCompat) & {
    isSupported?: () => Promise<boolean>;
  };
};

declare global {
  interface Window {
    firebase?: FirebaseCompat;
  }
}

let messagingPromise: Promise<FirebaseMessagingCompat | null> | undefined;
let foregroundListenerRegistered = false;

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !Capacitor.isNativePlatform() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function loadFirebaseScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Firebase Messaging could not be loaded.'));
    document.head.appendChild(script);
  });
}

async function getFirebaseMessaging(): Promise<FirebaseMessagingCompat | null> {
  if (!isPushSupported()) return null;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const cdn = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
      await loadFirebaseScript(`${cdn}/firebase-app-compat.js`);
      await loadFirebaseScript(`${cdn}/firebase-messaging-compat.js`);

      const firebase = window.firebase;
      if (!firebase) throw new Error('Firebase Messaging SDK did not initialize.');
      if (firebase.messaging.isSupported && !(await firebase.messaging.isSupported())) {
        return null;
      }

      const app = firebase.apps.length
        ? firebase.app()
        : firebase.initializeApp(FIREBASE_WEB_CONFIG);
      const messaging = firebase.messaging(app);
      if (!foregroundListenerRegistered) {
        foregroundListenerRegistered = true;
        messaging.onMessage((payload) => {
          if (Notification.permission !== 'granted') return;
          const notification = new Notification(
            payload.notification?.title || 'ViMore',
            {
              body: payload.notification?.body || '',
              icon: '/icons/icon-192.png',
              tag: payload.data?.tag || 'vimore-notification',
              data: payload.data,
            },
          );
          notification.onclick = () => {
            window.focus();
            const url = payload.data?.url;
            if (url?.startsWith('/')) window.location.assign(url);
            notification.close();
          };
        });
      }
      return messaging;
    })().catch((error) => {
      messagingPromise = undefined;
      throw error;
    });
  }
  return messagingPromise;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}

export async function subscribeToPush(): Promise<string | null> {
  if (!isPushSupported()) return null;

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return null;

  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;
  const reg = await navigator.serviceWorker.ready;
  const token = await messaging.getToken({
    vapidKey: FIREBASE_VAPID_PUBLIC_KEY,
    serviceWorkerRegistration: reg,
  });
  if (!token) return null;

  try {
    const response = await authFetch('/api/push/web-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: 'web' }),
    });
    if (!response.ok) throw new Error(`Push token registration failed (${response.status})`);
  } catch (err) {
    console.warn('[push] failed to save browser FCM token', err);
    throw err;
  }

  return token;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const messaging = await getFirebaseMessaging();
  if (!messaging) return false;
  try {
    if (Notification.permission === 'granted') {
      const token = await messaging.getToken({
        vapidKey: FIREBASE_VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: await navigator.serviceWorker.ready,
      });
      if (token) {
        await authFetch('/api/push/web-unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'web' }),
        });
      }
    }
    return await messaging.deleteToken();
  } catch (err) {
    console.warn('[push] failed to unsubscribe browser FCM token', err);
    return false;
  }
}

export async function getPushPermissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}
