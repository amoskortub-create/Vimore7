"use client";

import { useEffect } from "react";
import { usePosts } from "@/context/PostContext";
import { useNetwork } from "@/context/NetworkContext";
import { authFetch } from "@/lib/auth-fetch";

export function ActivityTracker() {
  const { currentUser } = usePosts();
  const { tier } = useNetwork();

  useEffect(() => {
    if (!currentUser?.$id) return;

    const track = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      authFetch("/api/user/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          user_id: currentUser.$id,
          username: currentUser.username || currentUser.name || "unknown",
        }),
      }).catch(() => {});
    };

    track();
    const intervalMs = tier === "lite" ? 120_000 : tier === "standard" ? 60_000 : 45_000;
    const interval = setInterval(track, intervalMs);
    const handleForeground = () => {
      if (document.visibilityState === "visible") track();
    };
    document.addEventListener("visibilitychange", handleForeground);
    window.addEventListener("pageshow", handleForeground);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleForeground);
      window.removeEventListener("pageshow", handleForeground);
    };
  }, [currentUser?.$id, currentUser?.username, currentUser?.name, tier]);

  return null;
}
