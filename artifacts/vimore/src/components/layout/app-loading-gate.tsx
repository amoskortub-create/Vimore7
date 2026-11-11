"use client";

import { usePosts } from "@/context/PostContext";
import { KineticSplashScreen } from "./kinetic-splash-screen";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const PUBLIC_PATHS = ["/login", "/signup", "/auth/", "/terms", "/privacy", "/child-safety", "/marketplace", "/join/", "/admin", "/downloads"];

function getActivePath(hookPath: string | null): string {
  if (typeof window !== 'undefined' && window.location.pathname) {
    return window.location.pathname;
  }
  if (hookPath) return hookPath;
  return '';
}

function isPublicActivePath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p));
}

export function AppLoadingGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isOffline, initError, currentUser } = usePosts();
  const router = useRouter();
  const pathname = usePathname();

  const mountedPath = useRef(getActivePath(pathname));
  useEffect(() => {
    const p = getActivePath(pathname);
    if (p) mountedPath.current = p;
  }, [pathname]);

  const activePath = getActivePath(pathname) || mountedPath.current;
  const isPublicPath = isPublicActivePath(activePath);

  const [isVisible, setIsVisible] = useState(true);
  const [shouldRenderSplash, setShouldRenderSplash] = useState(true);

  useEffect(() => {
    const current = getActivePath(pathname) || mountedPath.current;
    if (isPublicActivePath(current)) {
      setIsVisible(false);
      setShouldRenderSplash(false);
      return;
    }
    if (!isLoading && !initError) {
      setIsVisible(false);
      setShouldRenderSplash(false);
    }
  }, [isLoading, initError, pathname]);

  useEffect(() => {
    const current = getActivePath(pathname) || mountedPath.current;
    if (isPublicActivePath(current)) return;

    const fallbackTimer = setTimeout(() => {
      setIsVisible(false);
      setShouldRenderSplash(false);
    }, 8000);

    return () => clearTimeout(fallbackTimer);
  }, [pathname, isLoading, initError]);

  useEffect(() => {
    if (!isLoading && !isOffline && !currentUser) {
      const current = getActivePath(pathname) || mountedPath.current;
      if (!current || isPublicActivePath(current)) return;
      router.replace('/login');
    }
  }, [isLoading, isOffline, currentUser, pathname, router]);

  const showSplash = !isPublicPath && shouldRenderSplash;

  return (
    <>
      {showSplash && (
        <div className={cn(
          "fixed inset-0 z-[9999] transition-opacity duration-500 ease-in-out",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          <KineticSplashScreen />
        </div>
      )}
      <div className={cn(
        "flex-1 flex flex-col",
        !isPublicPath && "transition-opacity duration-1000 ease-out",
        (isPublicPath || !isVisible) ? "opacity-100" : "opacity-0"
      )}>
        {children}
      </div>
    </>
  );
}
