"use client";

import { useEffect } from "react";

const PRECACHE_ROUTES = [
  "/",
  "/marketplace",
  "/reels",
  "/music",
  "/messages",
  "/notifications",
  "/menu",
  "/settings",
  "/friends",
];

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    let idleTimer: number | undefined;
    let idleCallbackId: number | undefined;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_UPDATED") {
        window.dispatchEvent(
          new CustomEvent("sw-updated", {
            detail: { version: event.data.version },
          }),
        );
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    const schedulePrecache = () => {
      if ((window as unknown as { __vimoreNetTier?: string }).__vimoreNetTier !== "rich") {
        return;
      }
      const run = () => {
        if ((window as unknown as { __vimoreNetTier?: string }).__vimoreNetTier !== "rich") {
          return;
        }
        navigator.serviceWorker.ready
          .then((activeReg) => {
            activeReg.active?.postMessage({
              type: "PRECACHE_ROUTES",
              routes: PRECACHE_ROUTES,
            });
          })
          .catch(() => {});
      };

      const w = window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      idleTimer = window.setTimeout(() => {
        if (typeof w.requestIdleCallback === "function") {
          idleCallbackId = w.requestIdleCallback(run, { timeout: 3000 });
        } else {
          run();
        }
      }, 3500);
    };

    navigator.serviceWorker
      // The Capacitor app loads the same HTTPS origin as the website. Keep
      // the worker enabled there too so its shell and offline media caches
      // persist in the Android WebView; bypass the HTTP cache for worker updates.
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        void reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        schedulePrecache();
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      const w = window as unknown as { cancelIdleCallback?: (id: number) => void };
      if (idleCallbackId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleCallbackId);
      }
    };
  }, []);

  return null;
}
