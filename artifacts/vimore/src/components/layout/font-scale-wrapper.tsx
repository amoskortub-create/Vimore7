"use client";

import { usePosts } from "@/context/PostContext";
import { ReactNode, useEffect } from "react";

export function FontScaleWrapper({ children }: { children: ReactNode }) {
  const { settings } = usePosts();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const raw = Number(settings.fontScale || 1);
    const clamped = Math.min(1.4, Math.max(0.8, Number.isFinite(raw) ? raw : 1));
    document.documentElement.style.fontSize = `${(clamped * 16).toFixed(2)}px`;
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [settings.fontScale]);

  return (
    <div className="min-h-screen flex flex-col">
      {children}
    </div>
  );
}