"use client";

import { Activity, RefreshCw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MaintenanceScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f6f3] px-5 py-12 text-[#202923] dark:bg-[#101612] dark:text-[#f2f5f0]">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(52,91,67,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(52,91,67,.08)_1px,transparent_1px)] [background-size:36px_36px] dark:opacity-20" />
      <div className="relative w-full max-w-xl text-center">
        <div className="mb-9 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6d9a63] text-white">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-black">ViMore</span>
        </div>

        <div className="mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-[28px] border border-[#6d9a63]/20 bg-white/80 text-[#56834e] shadow-sm dark:bg-white/5 dark:text-[#9ac58e]">
          <Wrench className="h-11 w-11 animate-[maintenance-wrench_3s_ease-in-out_infinite]" aria-hidden="true" />
        </div>

        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Service restoration in progress
        </div>

        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">We&apos;ll be back soon</h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-[#59645b] dark:text-white/65 sm:text-base">
          We are currently conducting scheduled maintenance or fixing technical issues to improve your ViMore experience. Our team is actively working to restore service as quickly as possible. Thank you for your patience.
        </p>

        <Button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-8 h-12 gap-2 rounded-xl bg-[#477b48] px-6 font-semibold text-white hover:bg-[#39683b]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>

        <p className="mt-8 text-xs text-[#758077] dark:text-white/40">ViMore by Media Tech Liberia</p>
      </div>
      <style jsx>{`
        @keyframes maintenance-wrench {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(8deg); }
        }
      `}</style>
    </main>
  );
}