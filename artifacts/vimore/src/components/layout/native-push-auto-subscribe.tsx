"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePosts } from "@/context/PostContext";
import { registerNativePush } from "@/lib/native-push";

export function NativePushAutoSubscribe() {
  const { currentUser } = usePosts();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser?.$id) return;

    const register = () => {
      registerNativePush(currentUser.$id, (url) => router.push(url)).catch(
        (error) => {
          console.warn("[native-push] setup failed", error);
        },
      );
    };

    register();
    window.addEventListener("online", register);
    return () => window.removeEventListener("online", register);
  }, [currentUser?.$id, router]);

  return null;
}
