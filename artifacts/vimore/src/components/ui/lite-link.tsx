"use client";

import Link, { LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, AnchorHTMLAttributes, ReactNode } from "react";
import { useNetwork } from "@/context/NetworkContext";

type LiteLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children?: ReactNode;
    className?: string;
  };

/**
 * LiteLink — drop-in replacement for next/link that disables prefetch on Lite
 * networks. Saves a bunch of background route bundles for users on tight data caps.
 */
export const LiteLink = forwardRef<HTMLAnchorElement, LiteLinkProps>(function LiteLink(
  { prefetch, onPointerEnter, onPointerDown, onTouchStart, ...props },
  ref
) {
  const { tier } = useNetwork();
  const router = useRouter();
  const effectivePrefetch = tier === "lite" ? false : (prefetch ?? true);
  const prefetchOnIntent = () => {
    const href = props.href;
    const path = typeof href === "string" ? href : href.pathname;
    if (path?.startsWith("/")) router.prefetch(path);
  };

  return (
    <Link
      ref={ref}
      prefetch={effectivePrefetch}
      {...props}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (tier === "lite") prefetchOnIntent();
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        prefetchOnIntent();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        prefetchOnIntent();
      }}
    />
  );
});
