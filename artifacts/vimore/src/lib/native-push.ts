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
  const requested =
    permission.receive === "prompt" ||
    permission.receive === "prompt-with-rationale"
      ? await PushNotifications.requestPermissions()
      : permission;
  if (requested.receive !== "granted") {
    console.warn(
      `[native-push] notification permission is ${requested.receive}; enable notifications in Android settings`,
    );
    return;
  }

  await PushNotifications.register();
  await saveLatestToken();
}
