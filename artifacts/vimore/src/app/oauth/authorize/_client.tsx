"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { account } from "@/lib/appwrite";
import { authFetch } from "@/lib/auth-fetch";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, X, Check, AlertTriangle } from "lucide-react";

const SCOPE_LABELS: Record<string, string> = {
  profile: "Access your name, username, and profile picture",
  email: "Access your email address",
  "read:posts": "Read your public posts and activity",
};

export default function OAuthAuthorizePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const client_id = searchParams?.get("client_id") || "";
  const redirect_uri = searchParams?.get("redirect_uri") || "";
  const scope = searchParams?.get("scope") || "profile";
  const state = searchParams?.get("state") || "";
  const response_type = searchParams?.get("response_type") || "";
  const isPopupMode = searchParams?.get("popup") === "1";

  const [status, setStatus] = useState<"loading" | "ready" | "error" | "submitting">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [clientInfo, setClientInfo] = useState<{
    name: string;
    logo_url: string;
    website_url: string;
    redirect_uris?: string[];
  } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ $id: string; name: string } | null>(null);

  useEffect(() => {
    async function init() {
      if (!client_id || !redirect_uri || response_type !== "code") {
        setErrorMsg("Invalid OAuth request. Missing required parameters (client_id, redirect_uri, response_type=code).");
        setStatus("error");
        return;
      }

      try {
        const parsed = new URL(redirect_uri);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          setErrorMsg("Invalid redirect URI protocol.");
          setStatus("error");
          return;
        }
      } catch {
        setErrorMsg("Malformed redirect_uri parameter.");
        setStatus("error");
        return;
      }

      try {
        const user = await account.get();
        setCurrentUser({ $id: user.$id, name: user.name });
      } catch {
        const rawQuery = typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
        const nextTarget = `/oauth/authorize${rawQuery ? `?${rawQuery}` : ""}`;
        router.replace(`/login?next=${encodeURIComponent(nextTarget)}`);
        return;
      }

      try {
        const infoUrl = `/api/oauth/clients/info?client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}`;
        const clientRes = await fetch(infoUrl, { cache: "no-store" });
        const data = await clientRes.json().catch(() => null);

        if (!clientRes.ok || !data) {
          setErrorMsg(data?.error || "Unknown application or unregistered redirect URI.");
          setStatus("error");
          return;
        }

        const allowedUris: string[] = Array.isArray(data.redirect_uris) ? data.redirect_uris : [];
        if (!allowedUris.includes(redirect_uri)) {
          setErrorMsg("Redirect URI does not match any registered URI for this app.");
          setStatus("error");
          return;
        }

        setClientInfo({
          name: data.name || client_id,
          logo_url: data.logo_url || "",
          website_url: data.website_url || "",
          redirect_uris: allowedUris,
        });
        setStatus("ready");
      } catch {
        setErrorMsg("Could not verify the application. Please try again.");
        setStatus("error");
      }
    }
    init();
  }, [client_id, redirect_uri, response_type, router]);

  const scopes = scope.split(/\s+/).filter((s) => SCOPE_LABELS[s]);

  async function handleApprove() {
    if (!currentUser || status !== "ready") return;
    setStatus("submitting");
    try {
      const res = await authFetch("/api/oauth/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id, redirect_uri, scope, state }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.redirect) {
        if (isPopupMode && typeof window !== "undefined" && window.opener) {
          try {
            const targetOrigin = new URL(redirect_uri).origin;
            window.opener.postMessage(
              { type: "vimore_oauth_callback", code: data.code, state: data.state || state },
              targetOrigin
            );
            window.close();
            return;
          } catch {}
        }
        window.location.href = data.redirect;
      } else {
        setErrorMsg(data.error || "Authorization failed.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  function handleDeny() {
    if (!clientInfo?.redirect_uris?.includes(redirect_uri)) {
      router.push("/");
      return;
    }
    if (isPopupMode && typeof window !== "undefined" && window.opener) {
      try {
        const targetOrigin = new URL(redirect_uri).origin;
        window.opener.postMessage(
          { type: "vimore_oauth_callback", error: "access_denied", state },
          targetOrigin
        );
        window.close();
        return;
      } catch {}
    }
    const url = new URL(redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#F2ECF7] dark:bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-[#F2ECF7] dark:bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-[#111] rounded-3xl p-8 max-w-sm w-full shadow-xl text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight">Authorization Error</h2>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <Button variant="outline" className="w-full rounded-2xl" onClick={() => router.push("/")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2ECF7] dark:bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="bg-white dark:bg-[#111] rounded-3xl p-8 max-w-sm w-full shadow-xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0">
            {clientInfo?.logo_url ? (
              <img src={clientInfo.logo_url} alt={clientInfo.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl font-black text-primary">{clientInfo?.name?.[0] ?? "?"}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-base truncate">{clientInfo?.name}</p>
            {clientInfo?.website_url && (
              <p className="text-xs text-muted-foreground truncate">{clientInfo.website_url}</p>
            )}
          </div>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-black text-xs">VM</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-bold">
            <span className="text-primary">{clientInfo?.name}</span> wants to access your ViMore account
          </p>
          <p className="text-xs text-muted-foreground">Signed in as <strong>{currentUser?.name}</strong></p>
        </div>

        <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Permissions requested</p>
          {scopes.length > 0 ? scopes.map((s) => (
            <div key={s} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="h-3 w-3 text-primary" />
              </div>
              <p className="text-sm">{SCOPE_LABELS[s]}</p>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">Basic profile access</p>
          )}
        </div>

        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/10 rounded-2xl p-3">
          <ShieldCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-700 dark:text-green-400">
            ViMore will never share your password with third-party apps.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="rounded-2xl h-12 font-black uppercase text-xs tracking-wider border-destructive/30 text-destructive hover:bg-destructive/5"
            onClick={handleDeny}
            disabled={status === "submitting"}
          >
            <X className="h-4 w-4 mr-1" /> Deny
          </Button>
          <Button
            className="rounded-2xl h-12 font-black uppercase text-xs tracking-wider bg-primary"
            onClick={handleApprove}
            disabled={status === "submitting"}
          >
            {status === "submitting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <><Check className="h-4 w-4 mr-1" /> Allow</>
            )}
          </Button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          By allowing, you agree to share the requested info with {clientInfo?.name}.
          You can revoke access any time from your ViMore settings.
        </p>
      </div>
    </div>
  );
}
