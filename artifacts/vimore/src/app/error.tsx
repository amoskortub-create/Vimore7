"use client";

import { AppErrorScreen } from "@/components/layout/app-error-screen";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppErrorScreen onRetry={reset} />;
}