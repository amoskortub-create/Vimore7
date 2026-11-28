"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Fingerprint, Lock, Loader2, CheckCircle2, ShieldAlert, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePosts } from "@/context/PostContext";
import { cn } from "@/lib/utils";

const TITLE_TO_AREA: Record<string, string> = {
  "Direct Messages": "messages",
  "Earnings Portal": "earnings",
  "Credit Hub":      "currency",
};

type AuthCapability = "biometric" | "device-credential" | "none" | "checking";
type UnlockMode = "biometric" | "pin" | "password";

interface BiometricGateProps {
  children: React.ReactNode;
  title: string;
}

export function BiometricGate({ children, title }: BiometricGateProps) {
  const {
    settings,
    hasSecurityPin,
    verifyHardwareBiometrics,
    verifySecurityPinOrPassword,
    triggerHaptic,
  } = usePosts();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capability, setCapability] = useState<AuthCapability>("checking");
  const [unlockMode, setUnlockMode] = useState<UnlockMode>("biometric");
  const [credentialInput, setCredentialInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const areaKey = TITLE_TO_AREA[title] ?? title.toLowerCase().replace(/\s+/g, "-");
  const protectedAreas: string[] = settings.biometricProtectedAreas ?? ["messages", "earnings", "currency"];
  const isThisAreaProtected = protectedAreas.includes(areaKey);

  // Determine available device capability
  useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setCapability("none");
      setUnlockMode(hasSecurityPin ? "pin" : "password");
      return;
    }
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((hasBiometric) => {
        setCapability(hasBiometric ? "biometric" : "device-credential");
        if (!settings.isHardwareEnrolled) {
          setUnlockMode(hasSecurityPin ? "pin" : "password");
        } else {
          setUnlockMode("biometric");
        }
      })
      .catch(() => {
        setCapability("device-credential");
        if (!settings.isHardwareEnrolled) {
          setUnlockMode(hasSecurityPin ? "pin" : "password");
        }
      });
  }, [settings.isHardwareEnrolled, hasSecurityPin]);

  // If Device Security is off or this area isn't protected, allow straight through
  if (!settings.isBiometricActive || !isThisAreaProtected) {
    return <>{children}</>;
  }
  if (isAuthenticated) return <>{children}</>;

  const canUseWebAuthn = settings.isHardwareEnrolled && capability !== "none";

  const grantAccess = () => {
    setScanComplete(true);
    setErrorMsg(null);
    triggerHaptic(50);
    setTimeout(() => {
      setIsAuthenticated(true);
      setIsScanning(false);
      setCredentialInput("");
    }, 550);
  };

  const handleBiometricVerify = async () => {
    if (isScanning || scanComplete) return;
    setErrorMsg(null);
    setIsScanning(true);
    triggerHaptic(20);

    try {
      const success = await verifyHardwareBiometrics();
      if (success) {
        grantAccess();
      } else {
        setIsScanning(false);
        setErrorMsg("Device biometric failed or was cancelled. You can use your Security PIN or password below.");
        setUnlockMode(hasSecurityPin ? "pin" : "password");
        triggerHaptic(100);
      }
    } catch {
      setIsScanning(false);
      setErrorMsg("Biometric prompt unavailable here. Use your Security PIN or password.");
      setUnlockMode(hasSecurityPin ? "pin" : "password");
      triggerHaptic(100);
    }
  };

  const handleCredentialVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isScanning || scanComplete || !credentialInput.trim()) return;
    setErrorMsg(null);
    setIsScanning(true);
    triggerHaptic(20);

    try {
      const ok = await verifySecurityPinOrPassword(
        unlockMode === "pin"
          ? { pin: credentialInput.trim() }
          : { password: credentialInput }
      );
      if (ok) {
        grantAccess();
      } else {
        setIsScanning(false);
        setErrorMsg(
          unlockMode === "pin"
            ? "Incorrect Security PIN. Please try again."
            : "Incorrect account password. Please try again."
        );
        triggerHaptic(100);
      }
    } catch {
      setIsScanning(false);
      setErrorMsg("Verification error. Please try again.");
      triggerHaptic(100);
    }
  };

  const SensorIcon =
    unlockMode === "biometric" && capability === "biometric"
      ? Fingerprint
      : unlockMode === "pin"
        ? KeyRound
        : Lock;

  const hintLine =
    unlockMode === "biometric" && canUseWebAuthn
      ? capability === "biometric"
        ? "Verify with fingerprint or face ID to open"
        : "Verify with your device lock to open"
      : unlockMode === "pin"
        ? "Enter your Security PIN to unlock"
        : "Enter your ViMore password to unlock";

  return (
    <div className="fixed inset-0 z-[1000] bg-[#050505] flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/10 blur-[150px] rounded-full animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <header className="space-y-3">
          <div className="flex justify-center">
            <div className="bg-primary/10 border border-primary/20 rounded-2xl px-4 py-1.5 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Secure Access</span>
            </div>
          </div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">{title}</h1>
          <p className="text-white/50 text-sm font-medium">{hintLine}</p>
        </header>

        {/* Mode switcher pills */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {canUseWebAuthn && (
            <button
              type="button"
              onClick={() => { setUnlockMode("biometric"); setErrorMsg(null); }}
              className={cn(
                "px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                unlockMode === "biometric"
                  ? "bg-white text-black border-white"
                  : "bg-white/5 text-white/60 border-white/10 hover:text-white"
              )}
            >
              Biometric
            </button>
          )}
          {hasSecurityPin && (
            <button
              type="button"
              onClick={() => { setUnlockMode("pin"); setCredentialInput(""); setErrorMsg(null); }}
              className={cn(
                "px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                unlockMode === "pin"
                  ? "bg-white text-black border-white"
                  : "bg-white/5 text-white/60 border-white/10 hover:text-white"
              )}
            >
              Security PIN
            </button>
          )}
          <button
            type="button"
            onClick={() => { setUnlockMode("password"); setCredentialInput(""); setErrorMsg(null); }}
            className={cn(
              "px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
              unlockMode === "password"
                ? "bg-white text-black border-white"
                : "bg-white/5 text-white/60 border-white/10 hover:text-white"
            )}
          >
            Password
          </button>
        </div>

        {/* Sensor orb */}
        <div className="relative py-2 w-full flex flex-col items-center">
          <div
            className={cn(
              "relative h-36 w-36 rounded-full border-2 transition-all duration-500 flex items-center justify-center group",
              unlockMode === "biometric" && canUseWebAuthn && "cursor-pointer",
              isScanning   ? "border-cyan-400 shadow-[0_0_60px_rgba(34,211,238,0.4)] scale-105" :
              scanComplete ? "border-green-500 bg-green-500/10" :
              errorMsg     ? "border-destructive" :
                             "border-white/15 bg-white/5"
            )}
            onClick={() => {
              if (unlockMode === "biometric" && canUseWebAuthn) {
                void handleBiometricVerify();
              }
            }}
          >
            <div className="relative z-10 flex flex-col items-center gap-3">
              {scanComplete ? (
                <CheckCircle2 className="h-14 w-14 text-green-500 animate-in zoom-in duration-300" />
              ) : errorMsg ? (
                <ShieldAlert className="h-14 w-14 text-destructive" />
              ) : isScanning ? (
                <Loader2 className="h-14 w-14 text-cyan-400 animate-spin" />
              ) : (
                <SensorIcon className="h-14 w-14 text-white/60 group-hover:text-cyan-400 transition-colors" />
              )}
            </div>
          </div>

          {errorMsg && (
            <p className="mt-4 text-xs font-bold text-destructive max-w-xs">{errorMsg}</p>
          )}
        </div>

        {/* Action area */}
        <footer className="w-full space-y-4">
          {unlockMode === "biometric" && canUseWebAuthn ? (
            <Button
              type="button"
              className={cn(
                "w-full h-14 rounded-2xl font-black italic uppercase tracking-[0.18em] transition-all",
                isScanning || scanComplete
                  ? "bg-white/10 text-white/40"
                  : "bg-white text-black hover:bg-zinc-200 shadow-2xl"
              )}
              onClick={handleBiometricVerify}
              disabled={isScanning || scanComplete}
            >
              {isScanning
                ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verifying...</>
                : capability === "biometric"
                  ? "Scan Fingerprint / Face"
                  : "Use Device Lock"}
            </Button>
          ) : (
            <form onSubmit={handleCredentialVerify} className="space-y-3">
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  inputMode={unlockMode === "pin" ? "numeric" : "text"}
                  maxLength={unlockMode === "pin" ? 8 : 128}
                  value={credentialInput}
                  onChange={(e) => setCredentialInput(e.target.value)}
                  placeholder={unlockMode === "pin" ? "Enter 4–8 digit PIN" : "Enter account password"}
                  className="h-14 rounded-2xl bg-white/10 border-white/15 text-white placeholder:text-white/40 pr-12 text-center font-bold tracking-widest"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                type="submit"
                disabled={isScanning || scanComplete || !credentialInput.trim()}
                className="w-full h-14 rounded-2xl bg-white text-black hover:bg-zinc-200 font-black italic uppercase tracking-[0.18em] shadow-2xl"
              >
                {isScanning
                  ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verifying...</>
                  : scanComplete
                    ? "Access Granted"
                    : "Unlock"}
              </Button>
            </form>
          )}

          <div className="flex items-center justify-center gap-2 text-[9px] font-black text-white/25 uppercase tracking-widest">
            <ShieldCheck className="h-3 w-3" />
            Fingerprint · Face ID · Security PIN · Password
          </div>
        </footer>
      </div>
    </div>
  );
}
