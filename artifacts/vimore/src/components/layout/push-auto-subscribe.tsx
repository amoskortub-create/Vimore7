"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { usePosts } from "@/context/PostContext";
import { useNotifications } from "@/context/NotificationContext";
import { subscribeToPush, isPushSupported } from "@/lib/push-notifications";

export function PushAutoSubscribe() {
  const { currentUser } = usePosts();
  const { hasPushPermission } = useNotifications();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if ((currentUser as any)?.push_enabled === false) return;
    if (!currentUser?.$id || !hasPushPermission || !isPushSupported()) return;

    subscribeToPush().catch((error) => {
      console.warn("[push] automatic subscription failed", error);
    });
  }, [currentUser?.$id, (currentUser as any)?.push_enabled, hasPushPermission]);

  return null;
}
