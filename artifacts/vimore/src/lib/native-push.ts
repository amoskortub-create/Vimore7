import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { authFetch } from "@/lib/auth-fetch";

let listenersRegistered = false;
let currentUserId: string | undefined;
let latestToken: Token | undefined;
let lastSavedTokenKey: string | undefined;
let onOpenHandler: ((url: string) => void) | undefined;
let registrationInProgress: Promise<'granted' | 'denied' | 'unavailable'> | undefined;

export function isNativePushAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export async function checkNativePushPermission(): Promise<boolean> {
  if (!isNativePushAvailable()) return false;
  try {
    const permission = await PushNotifications.checkPermissions();
    return permission.receive === "granted";
  } catch {
    return false;
  }
}

async function saveToken(token: Token, userId: string): Promise<void> {
  const response = await authFetch("/api/push/native-subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.value, userId }),
  });
  if (!response.ok) {
    throw new Error(
      `Native push token registration failed (${response.status})`,
    );
  }
}

async function saveLatestToken(): Promise<void> {
  if (!latestToken || !currentUserId) return;
  const tokenKey = `${currentUserId}:${latestToken.value}`;
  if (tokenKey === lastSavedTokenKey) return;

  await saveToken(latestToken, currentUserId);
  lastSavedTokenKey = tokenKey;
}

export async function registerNativePush(
  userId: string | undefined,
  onOpen?: (url: string) => void,
): Promise<'granted' | 'denied' | 'unavailable'> {
  if (!isNativePushAvailable()) return 'unavailable';
  if (userId) currentUserId = userId;
  if (onOpen) onOpenHandler = onOpen;

  if (!listenersRegistered) {
    listenersRegistered = true;
    await PushNotifications.addListener("registration", (token) => {
      latestToken = token;
      console.info(
        `[native-push] FCM registration token received (${token.value.length} characters)`,
      );
      void saveLatestToken().catch((error: unknown) => {
        console.error("[native-push] token save failed", error);
      });
    });
    await PushNotifications.addListener("registrationError", (error) => {
      console.error("[native-push] registration failed", error);
    });
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const url = (action.notification.data as { url?: string } | undefined)
          ?.url;
        if (url && url.startsWith("/")) onOpenHandler?.(url);
      },
    );
  }

  if (registrationInProgress) {
    return registrationInProgress;
  }

  registrationInProgress = (async (): Promise<'granted' | 'denied' | 'unavailable'> => {
    try {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === "granted") {
        await PushNotifications.register();
        await saveLatestToken();
        return "granted";
      }

      if (
        permission.receive === "prompt" ||
        permission.receive === "prompt-with-rationale"
      ) {
        permission = await PushNotifications.requestPermissions();
        if (permission.receive === "granted") {
          await PushNotifications.register();
          await saveLatestToken();
          return "granted";
        }
      }

      return "denied";
    } catch {
      return "unavailable";
    }
  })();

  try {
    return await registrationInProgress;
  } finally {
    registrationInProgress = undefined;
  }
}
