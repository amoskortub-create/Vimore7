"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f3] px-5 py-12 text-[#202923] dark:bg-[#101612] dark:text-[#f2f5f0]">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-3xl font-bold">Something went wrong</h1>
        <p className="mt-4 text-sm leading-7 text-[#59645b] dark:text-white/65 sm:text-base">
          ViMore ran into an unexpected error. Please try again.
        </p>
        <Button
          type="button"
          onClick={onRetry}
          className="mt-8 h-12 gap-2 rounded-xl bg-[#477b48] px-6 font-semibold text-white hover:bg-[#39683b]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </main>
  );
}