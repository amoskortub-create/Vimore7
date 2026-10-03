import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";

let listenersRegistered = false;
let currentUserId: string | undefined;
let latestToken: Token | undefined;
let lastSavedTokenKey: string | undefined;
let onOpenHandler: ((url: string) => void) | undefined;

export function isNativePushAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function saveToken(token: Token, userId: string): Promise<void> {
  const response = await fetch("/api/push/native-subscribe", {
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
): Promise<void> {
  if (!isNativePushAvailable()) return;
  currentUserId = userId;
  onOpenHandler = onOpen;

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

  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "prompt") {
    if (permission.receive === "granted") {
      await PushNotifications.register();
      await saveLatestToken();
    }
    return;
  }

  const promptKey = "vimore_native_push_prompted";
  if (typeof window !== "undefined" && window.localStorage.getItem(promptKey) === "1") {
    return;
  }

  const TEN_MINUTES_MS = 10 * 60 * 1000;
  setTimeout(() => {
    void (async () => {
      try {
        const requested = await PushNotifications.requestPermissions();
        if (requested.receive === "granted") {
          await PushNotifications.register();
          await saveLatestToken();
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(promptKey, "1");
        }
      } catch (error) {
        console.warn("[native-push] delayed permission request failed", error);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(promptKey, "1");
        }
      }
    })();
  }, TEN_MINUTES_MS);
}
