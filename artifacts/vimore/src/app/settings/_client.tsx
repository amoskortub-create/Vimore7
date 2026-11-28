
"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  ArrowLeft, 
  User, 
  Shield, 
  Zap, 
  Volume2, 
  Smartphone, 
  Moon, 
  Sun, 
  EyeOff, 
  Monitor, 
  Download, 
  Type, 
  ChevronRight,
  ShieldCheck,
  BellOff,
  Database,
  RefreshCcw,
  Languages,
  Fingerprint,
  UserCheck,
  Users2,
  Lock,
  Globe,
  MoreVertical,
  HardDrive,
  Archive,
  ArrowDownToLine,
  Activity,
  Music2,
  Video,
  Loader2,
  Bell,
  Clock,
  Radio,
  Sparkles,
  Trophy,
  UserPlus,
  Rocket,
  Search,
  CheckCircle2,
  Gem,
  X,
  ShieldAlert,
  KeyRound,
  Timer,
  Eye,
  FileText,
  ZapOff,
  LayoutDashboard,
  Gauge,
  Code2,
  Ban,
  VolumeX,
  BellRing,
  MessageSquare,
  Heart,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AcronymCard } from "@/components/branding/acronym-meaning";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePosts } from "@/context/PostContext";
import { useMusic } from "@/context/MusicContext";
import { useNotifications } from "@/context/NotificationContext";
import { useTranslation } from "@/context/LanguageContext";
import { useNetwork } from "@/context/NetworkContext";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { clearAllLocalCaches } from "@/lib/offline-cache";
import { playNotificationSound } from "@/lib/notification-sound";
import { authFetch } from "@/lib/auth-fetch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NativeAdNode } from "@/components/ad/native-ad-node";
import ProfileLoading from "../profile/loading";

interface BlockedUserEntry {
  docId?: string;
  userId?: string;
  username: string;
  name: string;
  avatar: string;
}

export default function SettingsPage() {
  const {
    settings,
    updateSettings,
    triggerHaptic,
    currentUser,
    connections,
    savedPostIds,
    activeSubscriptions,
    seenPostIds,
    archiveIdentityNode,
    isLoading,
    logout,
    enrollHardwareBiometrics,
    hasSecurityPin,
    setSecurityPin,
    removeSecurityPin,
    syncAllSettings,
    blockedUsernames,
    unblockUser,
    mutedUserNames,
    toggleMuteUser,
  } = usePosts();
  const { currentTrack, isExpanded, downloadedSongIds, userSongs } = useMusic();
  const { hasPushPermission, requestPushPermission } = useNotifications();
  const { t } = useTranslation();
  const { tier, effectiveType, forcedTier, setForcedTier, saveData } = useNetwork();
  const { toast } = useToast();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isLegacySelectorOpen, setIsLegacySelectorOpen] = useState(false);
  const [legacySearch, setLegacySearch] = useState("");
  const [isEnrollingBiometric, setIsEnrollingBiometric] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isTogglingPush, setIsTogglingPush] = useState(false);
  const [pushPreferenceEnabled, setPushPreferenceEnabled] = useState(true);

  // Security PIN dialog state
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pinMode, setPinMode] = useState<'set' | 'remove'>('set');
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentCred, setCurrentCred] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Blocked & Muted dialog state
  const [isBlockedDialogOpen, setIsBlockedDialogOpen] = useState(false);
  const [blockedList, setBlockedList] = useState<BlockedUserEntry[]>([]);
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(false);

  useEffect(() => {
    setPushPreferenceEnabled((currentUser as any)?.push_enabled !== false);
  }, [currentUser]);

  const isPlayerActive = currentTrack && !isExpanded;
  void isPlayerActive;

  const handleSync = async () => {
    setIsSyncing(true);
    triggerHaptic(50);
    try {
      await syncAllSettings();
      toast({ title: t('ui_linguistic_sync'), description: "All settings and account data are synchronized." });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: err?.message || "Could not synchronize settings right now.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdate = (data: any) => {
    triggerHaptic(10);
    updateSettings(data);
  };

  const handleClearCache = async () => {
    triggerHaptic(50);
    setIsClearingCache(true);
    try {
      await clearAllLocalCaches();
      toast({ title: "Cache Cleared", description: "All cached pages, media, and data have been removed." });
    } catch {
      toast({ variant: "destructive", title: "Failed to Clear Cache", description: "Something went wrong. Please try again." });
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleArchiveExport = async () => {
    triggerHaptic(20);
    setIsArchiving(true);
    try {
      await archiveIdentityNode();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: err?.message || "Could not generate your account data archive.",
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleBiometricToggle = async (val: boolean) => {
    triggerHaptic(10);
    if (!val) {
      updateSettings({ isBiometricActive: false });
      toast({ title: "Device Lock Disabled", description: "Messages, Earnings, and Credit Hub are no longer locked." });
      return;
    }

    if (settings.isHardwareEnrolled || hasSecurityPin) {
      updateSettings({ isBiometricActive: true });
      toast({ title: "Device Lock Active", description: "Protected areas are now locked with your security credential." });
      return;
    }

    setIsEnrollingBiometric(true);
    try {
      const success = await enrollHardwareBiometrics();
      if (success) {
        toast({ title: "Biometric Vault Active", description: "Messages and Earnings are now protected by your device." });
      } else {
        // Always enable lock with account password fallback + invite user to set a Security PIN
        updateSettings({ isBiometricActive: true });
        setPinMode('set');
        setNewPin("");
        setConfirmPin("");
        setCurrentCred("");
        setPinError(null);
        setIsPinDialogOpen(true);
        toast({
          title: "Device Lock Enabled",
          description: "Protected with your account password. Set a 4–8 digit PIN below for faster unlocking.",
        });
      }
    } catch {
      updateSettings({ isBiometricActive: true });
      toast({
        title: "Device Lock Enabled",
        description: "Protected with your account password. You can also set a Security PIN.",
      });
    } finally {
      setIsEnrollingBiometric(false);
    }
  };

  const handleReEnrollBiometrics = async () => {
    triggerHaptic(15);
    setIsEnrollingBiometric(true);
    try {
      const ok = await enrollHardwareBiometrics();
      if (ok) {
        toast({ title: "Fingerprint / Face Registered", description: "Biometric unlock is ready on this device." });
      } else {
        toast({
          variant: "destructive",
          title: "Biometrics Unavailable",
          description: "This browser or device couldn't register WebAuthn biometrics. Security PIN & account password are active.",
        });
      }
    } finally {
      setIsEnrollingBiometric(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (pinMode === 'set') {
      if (!/^\d{4,8}$/.test(newPin.trim())) {
        setPinError("Security PIN must be 4 to 8 digits.");
        return;
      }
      if (newPin.trim() !== confirmPin.trim()) {
        setPinError("PIN entries do not match.");
        return;
      }
      if (hasSecurityPin && !currentCred.trim()) {
        setPinError("Enter your current PIN or account password to replace your PIN.");
        return;
      }
      setIsSavingPin(true);
      try {
        await setSecurityPin(newPin.trim(), currentCred.trim() || undefined);
        setIsPinDialogOpen(false);
        setNewPin("");
        setConfirmPin("");
        setCurrentCred("");
        toast({ title: "Security PIN Saved", description: "You can now unlock Messages and Earnings with your PIN." });
      } catch (err: any) {
        setPinError(err?.message || "Could not save Security PIN.");
      } finally {
        setIsSavingPin(false);
      }
    } else {
      if (!currentCred.trim()) {
        setPinError("Enter your current PIN or account password to confirm.");
        return;
      }
      setIsSavingPin(true);
      try {
        await removeSecurityPin(currentCred.trim());
        setIsPinDialogOpen(false);
        setCurrentCred("");
        toast({ title: "Security PIN Removed", description: "Account password remains available as fallback." });
      } catch (err: any) {
        setPinError(err?.message || "Could not remove Security PIN.");
      } finally {
        setIsSavingPin(false);
      }
    }
  };

  const handlePushToggle = async (val: boolean) => {
    triggerHaptic(10);
    setIsTogglingPush(true);
    try {
      if (val) {
        await requestPushPermission();
      }
      setPushPreferenceEnabled(val);
      const res = await authFetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pushEnabled: val }),
      });
      if (!res.ok) throw new Error('Could not update notification preference.');
      toast({
        title: val ? "Push Alerts Enabled" : "Push Alerts Muted",
        description: val
          ? "Browser/device alerts are active when permission is granted."
          : "Background push notifications are turned off.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Notification Update Failed",
        description: err?.message || "Check browser notification permissions and try again.",
      });
    } finally {
      setIsTogglingPush(false);
    }
  };

  const openBlockedManager = async () => {
    triggerHaptic(10);
    setIsBlockedDialogOpen(true);
    setIsLoadingBlocked(true);
    try {
      const res = await authFetch('/api/user/block', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.blocked)) {
        setBlockedList(data.blocked);
      } else {
        setBlockedList(
          blockedUsernames.map((uname) => ({
            username: uname,
            name: uname,
            avatar: '',
          }))
        );
      }
    } catch {
      setBlockedList(
        blockedUsernames.map((uname) => ({
          username: uname,
          name: uname,
          avatar: '',
        }))
      );
    } finally {
      setIsLoadingBlocked(false);
    }
  };

  const filteredConnections = useMemo(() => {
    return connections.filter(c => c.followsYou && (c.name.toLowerCase().includes(legacySearch.toLowerCase()) || c.username.toLowerCase().includes(legacySearch.toLowerCase())));
  }, [connections, legacySearch]);

  const selectedLegacyNode = useMemo(() => {
    return connections.find(c => c.username === settings.legacyContact);
  }, [connections, settings.legacyContact]);

  // Simulated Storage Pulse Calculation
  const storageMetrics = useMemo(() => {
    const mediaBase = (downloadedSongIds.size * 12.5) + (userSongs.length * 15); // MB
    const cacheBase = (seenPostIds.size * 0.4); // MB
    const notesBase = (savedPostIds.size * 0.1); // MB
    
    const total = mediaBase + cacheBase + notesBase;
    const percent = (total / 2048) * 100; // Assuming 2GB vault limit

    return {
      total: total > 1024 ? `${(total/1024).toFixed(1)} GB` : `${total.toFixed(0)} MB`,
      media: `${mediaBase.toFixed(0)} MB`,
      cache: `${cacheBase.toFixed(0)} MB`,
      notes: `${notesBase.toFixed(0)} MB`,
      percent: Math.min(percent, 100)
    };
  }, [downloadedSongIds.size, userSongs.length, seenPostIds.size, savedPostIds.size]);

  // Handshake Guard: Prerender protection
  if (isLoading || !currentUser) {
    return <ProfileLoading />;
  }

  return (
    <div className="min-h-screen bg-[#F0F2F5] dark:bg-[#050505] transition-colors duration-300">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-card/80 backdrop-blur-md border-b border-border h-16 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/menu">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-secondary/80 active:scale-90 transition-all">
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-lg font-black italic uppercase tracking-tighter text-foreground">{t('settings_title')}</h1>
            <div className="flex items-center gap-1.5">
              <div className={cn("h-1.5 w-1.5 rounded-full", isSyncing ? "bg-primary animate-ping" : "bg-green-500")} />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{isSyncing ? t('ui_syncing') : t('ui_status_optimal')}</span>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest text-primary gap-2 transition-all active:scale-95" onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />} {t('ui_manual_sync')}
        </Button>
      </header>

      <main className={cn(
        "max-w-xl mx-auto p-4 sm:p-8 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32",
        "pt-4"
      )}>
        
        <NativeAdNode type="banner-468" id="settings-top-pulse" />

        {/* NETWORK OPTIMIZATION (LITE MODE) */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Network Optimization</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-6 space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ZapOff className="h-4 w-4 text-primary shrink-0" />
                  <p className="font-bold text-sm">Lite Mode</p>
                  <Badge className={cn(
                    "text-[9px] font-black uppercase tracking-widest border-none",
                    tier === 'lite' ? "bg-amber-500/15 text-amber-600" : tier === 'standard' ? "bg-blue-500/15 text-blue-600" : "bg-emerald-500/15 text-emerald-600"
                  )}>{tier}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black break-words">
                  Detected: {effectiveType}{saveData ? " · save-data on" : ""}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              ViMore runs in ultra-efficient Lite Mode by default so photos and videos stay visible while 100 MB of data can last up to 3 hours. Switch to Standard or Full HD anytime.
            </p>

            <div className="grid grid-cols-4 gap-1.5 bg-secondary/40 p-1.5 rounded-2xl">
              <button
                onClick={() => { triggerHaptic(10); setForcedTier(null); }}
                className={cn(
                  "flex items-center justify-center gap-1 px-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  forcedTier === null ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                )}
              >
                Auto
              </button>
              <button
                onClick={() => { triggerHaptic(10); setForcedTier('lite'); }}
                className={cn(
                  "flex items-center justify-center gap-1 px-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  forcedTier === 'lite' ? "bg-white dark:bg-zinc-800 text-amber-600 shadow-md" : "text-muted-foreground"
                )}
              >
                Lite
              </button>
              <button
                onClick={() => { triggerHaptic(10); setForcedTier('standard'); }}
                className={cn(
                  "flex items-center justify-center gap-1 px-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  forcedTier === 'standard' ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-md" : "text-muted-foreground"
                )}
              >
                Std
              </button>
              <button
                onClick={() => { triggerHaptic(10); setForcedTier('rich'); }}
                className={cn(
                  "flex items-center justify-center gap-1 px-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  forcedTier === 'rich' ? "bg-white dark:bg-zinc-800 text-emerald-600 shadow-md" : "text-muted-foreground"
                )}
              >
                Full
              </button>
            </div>
          </div>
        </section>

        {/* SUBSCRIPTIONS */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">{t('settings_subs')}</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-2 space-y-1">
            <Link href="/settings/subscriptions" className="flex items-center justify-between p-4 rounded-2xl hover:bg-secondary/40 transition-all group">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-transform">
                  <Gem className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-bold text-sm">Subscription Vault</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">{activeSubscriptions.size} Active Creator Loops</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
            </Link>
          </div>
        </section>

        {/* APPEARANCE */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">{t('settings_appearance')}</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-6 space-y-8">
            <div className="flex flex-col gap-4">
              <div className="space-y-0.5">
                <p className="font-bold text-sm">{t('settings_theme')}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-black">{t('settings_theme_desc')}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 bg-secondary/40 p-1.5 rounded-2xl">
                <button
                  onClick={() => handleUpdate({ theme: 'light' })}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.theme === 'light' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="h-3.5 w-3.5">☀</span> {t('settings_theme_ivory')}
                </button>
                <button
                  onClick={() => handleUpdate({ theme: 'dark' })}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.theme === 'dark' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="h-3.5 w-3.5">🌙</span> {t('settings_theme_space')}
                </button>
                <button
                  onClick={() => handleUpdate({ theme: 'system' })}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.theme === 'system' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="h-3.5 w-3.5">🖥</span> {t('settings_theme_sync')}
                </button>
              </div>
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Type className="h-4 w-4 text-primary" />
                    <p className="font-bold text-sm">{t('settings_font_scale')}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Calibrate global text size</p>
                </div>
                <Badge className="bg-primary/5 text-primary border-primary/10 text-[10px] font-black">{Math.round(settings.fontScale * 100)}%</Badge>
              </div>
              <Slider value={[settings.fontScale]} min={0.8} max={1.4} step={0.05} onValueChange={(val) => handleUpdate({ fontScale: val[0] })} />
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <p className="font-bold text-sm">Haptic Feedback</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Vibration intensity on taps</p>
                </div>
                <Badge className="bg-primary/5 text-primary border-primary/10 text-[10px] font-black">
                  {settings.hapticIntensity === 0 ? "Off" : `${settings.hapticIntensity}%`}
                </Badge>
              </div>
              <Slider
                value={[settings.hapticIntensity]}
                min={0}
                max={100}
                step={10}
                onValueChange={(val) => {
                  updateSettings({ hapticIntensity: val[0] });
                  if (val[0] > 0 && typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(Math.max(8, Math.round(val[0] * 0.4)));
                  }
                }}
              />
            </div>
          </div>
        </section>

        {/* NOTIFICATIONS & ALERTS */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Notifications</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Push Notifications</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">
                  {hasPushPermission && pushPreferenceEnabled ? "Active on this device" : "Enable background alerts"}
                </p>
              </div>
              <Switch
                checked={pushPreferenceEnabled && hasPushPermission}
                onCheckedChange={handlePushToggle}
                disabled={isTogglingPush}
              />
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Message Alerts</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Play chimes for incoming DMs</p>
              </div>
              <Switch
                checked={settings.pushMessageAlerts}
                onCheckedChange={(val) => handleUpdate({ pushMessageAlerts: val })}
              />
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Social Activity Alerts</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Chimes for likes, comments &amp; follows</p>
              </div>
              <Switch
                checked={settings.pushSocialAlerts}
                onCheckedChange={(val) => handleUpdate({ pushSocialAlerts: val })}
              />
            </div>
          </div>
        </section>

        {/* EXPERIENCE HUB */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Experience Hub</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-6 space-y-8">
            
            <div className="flex flex-col gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">{t('settings_stream')}</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Initial landing node for feeds</p>
              </div>
              <div className="grid grid-cols-2 gap-2 bg-secondary/40 p-1.5 rounded-2xl">
                <button
                  onClick={() => handleUpdate({ defaultStream: 'following' })}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.defaultStream === 'following' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  Following
                </button>
                <button
                  onClick={() => handleUpdate({ defaultStream: 'foryou' })}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.defaultStream === 'foryou' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  For You
                </button>
              </div>
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex flex-col gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">{t('settings_playback')}</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Tune spatial video resolution</p>
              </div>
              <div className="grid grid-cols-2 gap-2 bg-secondary/40 p-1.5 rounded-2xl">
                <button
                  onClick={() => handleUpdate({ playbackQuality: 'standard' })}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.playbackQuality === 'standard' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  Standard
                </button>
                <button
                  onClick={() => handleUpdate({ playbackQuality: 'pro-hd' })}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.playbackQuality === 'pro-hd' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  Pro-HD
                </button>
              </div>
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Auto-Translate Posts</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Offer one-tap translation on foreign posts</p>
              </div>
              <Switch checked={settings.autoTranslate} onCheckedChange={(val) => handleUpdate({ autoTranslate: val })} />
            </div>

          </div>
        </section>

        {/* DATA & ARCHIVAL */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">{t('settings_data')}</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-6 space-y-8">
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    <p className="font-bold text-sm">Storage Pulse</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Hardware space synchronization</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-black italic text-primary">{storageMetrics.total} / 2 GB</span>
                  <span className="text-[8px] font-bold text-muted-foreground uppercase">Vault Limit</span>
                </div>
              </div>
              
              <div className="space-y-3">
                <Progress value={storageMetrics.percent} className="h-1.5" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="h-1 bg-primary rounded-full" />
                    <span className="text-[8px] font-black uppercase text-muted-foreground">Media ({storageMetrics.media})</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="h-1 bg-accent rounded-full" />
                    <span className="text-[8px] font-black uppercase text-muted-foreground">Cache ({storageMetrics.cache})</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="h-1 bg-muted rounded-full" />
                    <span className="text-[8px] font-black uppercase text-muted-foreground">Notes ({storageMetrics.notes})</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="grid grid-cols-1 gap-3">
              <Button 
                variant="outline" 
                disabled={isArchiving}
                className="h-16 rounded-2xl border-primary/10 bg-white dark:bg-card justify-start gap-4 px-6 group hover:bg-primary/5 transition-all"
                onClick={handleArchiveExport}
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  {isArchiving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Archive className="h-5 w-5" />}
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-bold text-sm">{isArchiving ? "Preparing Archive..." : t('settings_archive')}</span>
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Download full account data JSON</span>
                </div>
                <ArrowDownToLine className="ml-auto h-4 w-4 text-muted-foreground/40" />
              </Button>

              <Button
                variant="outline"
                disabled={isClearingCache}
                className="h-16 rounded-2xl border-destructive/10 bg-white dark:bg-card justify-start gap-4 px-6 group hover:bg-destructive/5 transition-all"
                onClick={handleClearCache}
              >
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  isClearingCache ? "bg-destructive/10 text-destructive" : "bg-destructive/10 text-destructive group-hover:scale-110"
                )}>
                  {isClearingCache ? <Loader2 className="h-5 w-5 animate-spin" /> : <Database className="h-5 w-5" />}
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-bold text-sm text-destructive">
                    {isClearingCache ? "Clearing Cache..." : "Clear Cache"}
                  </span>
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                    Delete all cached pages &amp; media
                  </span>
                </div>
                {!isClearingCache && <X className="ml-auto h-4 w-4 text-destructive/40" />}
              </Button>
            </div>
          </div>
        </section>

        {/* SECURITY & VAULT */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">{t('settings_security')}</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-6 space-y-6">
            <Link href="/settings/account" className="flex items-center justify-between p-2 rounded-2xl hover:bg-secondary/40 transition-all group">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-bold text-sm">Security Handshake</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Passwords & Signature Rotation</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
            </Link>

            <div className="h-px bg-border -mx-6" />

            {/* ── DEVICE SECURITY (biometric / PIN / pattern / face / password) ── */}
            <div className="space-y-0">
              {/* Main toggle row */}
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                    settings.isBiometricActive ? "bg-green-500 text-white" : "bg-primary/10 text-primary"
                  )}>
                    {isEnrollingBiometric
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : settings.isBiometricActive
                        ? <ShieldCheck className="h-5 w-5" />
                        : <Lock className="h-5 w-5" />
                    }
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm">Device Security</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-black">
                      {isEnrollingBiometric
                        ? "Registering with your device..."
                        : settings.isBiometricActive
                          ? `${settings.biometricProtectedAreas?.length ?? 0} area${(settings.biometricProtectedAreas?.length ?? 0) !== 1 ? 's' : ''} protected`
                          : "Fingerprint · Face · PIN · Pattern · Password"}
                    </p>
                  </div>
                </div>
                <Switch checked={settings.isBiometricActive} onCheckedChange={handleBiometricToggle} disabled={isEnrollingBiometric} />
              </div>

              {/* Expanded area selector & credentials — shown when security is ON */}
              {settings.isBiometricActive && (
                <div className="mt-3 mx-2 bg-secondary/30 rounded-2xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 flex-wrap">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      Protected Areas — tap to toggle
                    </p>
                    <div className="flex items-center gap-1.5">
                      {settings.isHardwareEnrolled && (
                        <Badge className="bg-green-500/15 text-green-600 border-none text-[8px] font-black uppercase">Biometric</Badge>
                      )}
                      {hasSecurityPin && (
                        <Badge className="bg-primary/15 text-primary border-none text-[8px] font-black uppercase">PIN Set</Badge>
                      )}
                      <Badge className="bg-secondary text-muted-foreground border-none text-[8px] font-black uppercase">Password Backup</Badge>
                    </div>
                  </div>
                  {([
                    { key: 'messages', label: 'Messages',       icon: '💬', desc: 'Direct messages & chats' },
                    { key: 'earnings', label: 'Earnings',        icon: '💰', desc: 'Wallet & earnings portal' },
                    { key: 'currency', label: 'Credit Hub',      icon: '💎', desc: 'Credits & conversions' },
                  ] as const).map(({ key, label, icon, desc }) => {
                    const areas: string[] = settings.biometricProtectedAreas ?? [];
                    const active = areas.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          triggerHaptic(10);
                          const next = active
                            ? areas.filter(a => a !== key)
                            : [...areas, key];
                          updateSettings({ biometricProtectedAreas: next });
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-all border-t border-border/40 first:border-t-0"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-base">{icon}</span>
                          <div className="text-left">
                            <p className="text-xs font-bold">{label}</p>
                            <p className="text-[9px] text-muted-foreground uppercase font-black">{desc}</p>
                          </div>
                        </div>
                        <div className={cn(
                          "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                          active ? "bg-green-500 border-green-500" : "border-muted-foreground/30"
                        )}>
                          {active && <CheckCircle2 className="h-3 w-3 text-white" />}
                        </div>
                      </button>
                    );
                  })}

                  <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-border/40 bg-secondary/20">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5"
                      onClick={() => {
                        triggerHaptic(10);
                        setPinMode('set');
                        setNewPin("");
                        setConfirmPin("");
                        setCurrentCred("");
                        setPinError(null);
                        setIsPinDialogOpen(true);
                      }}
                    >
                      <KeyRound className="h-3 w-3" />
                      {hasSecurityPin ? "Change Security PIN" : "Set Security PIN"}
                    </Button>
                    {hasSecurityPin && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider text-destructive hover:bg-destructive/10 gap-1"
                        onClick={() => {
                          triggerHaptic(10);
                          setPinMode('remove');
                          setCurrentCred("");
                          setPinError(null);
                          setIsPinDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3 w-3" /> Remove PIN
                      </Button>
                    )}
                    {!settings.isHardwareEnrolled && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isEnrollingBiometric}
                        className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5"
                        onClick={handleReEnrollBiometrics}
                      >
                        <Fingerprint className="h-3 w-3" /> Register Biometric
                      </Button>
                    )}
                  </div>

                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-4 py-2.5 border-t border-border/40 flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-green-500 shrink-0" />
                    Unlocks with fingerprint, face ID, Security PIN, or your account password
                  </p>
                </div>
              )}
            </div>

            <div className="h-px bg-border -mx-6" />

            <Link href="/settings/connected-apps" className="flex items-center justify-between p-2 rounded-2xl hover:bg-secondary/40 transition-all group">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 group-hover:scale-110 transition-transform">
                  <Code2 className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-bold text-sm">Connected Apps</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Third-party access & OAuth</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
            </Link>
          </div>
        </section>

        {/* ACOUSTIC PULSE */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Acoustic Pulse</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-6 space-y-8">
            <div className="space-y-4">
              <div className="space-y-0.5">
                <p className="font-bold text-sm">Sound Signature</p>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Choose your network notification tone</p>
              </div>
              <div className="grid grid-cols-2 gap-2 bg-secondary/40 p-1.5 rounded-2xl">
                <button
                  onClick={() => { handleUpdate({ activeSoundSet: 'cyberpunk' }); playNotificationSound('cyberpunk'); }}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.activeSoundSet === 'cyberpunk' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  <Zap className="h-3.5 w-3.5" /> Cyberpunk
                </button>
                <button
                  onClick={() => { handleUpdate({ activeSoundSet: 'lofi' }); playNotificationSound('lofi'); }}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.activeSoundSet === 'lofi' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  <Music2 className="h-3.5 w-3.5" /> Lo-Fi
                </button>
              </div>
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-primary" />
                    <p className="font-bold text-sm">{t('settings_quiet_hours')}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Suppress pulses during rest cycles</p>
                </div>
                <Switch checked={settings.isSilenceActive} onCheckedChange={(val) => handleUpdate({ isSilenceActive: val })} />
              </div>

              {settings.isSilenceActive && (
                <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Start Pulse</Label>
                    <Input type="time" value={settings.silenceStart} onChange={(e) => handleUpdate({ silenceStart: e.target.value })} className="h-10 bg-secondary/20 border-none rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">End Pulse</Label>
                    <Input type="time" value={settings.silenceEnd} onChange={(e) => handleUpdate({ silenceEnd: e.target.value })} className="h-10 bg-secondary/20 border-none rounded-xl" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* PRIVACY & SIGNATURE */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">{t('settings_privacy')}</h3>
          <div className="bg-white dark:bg-card rounded-[2.5rem] border border-border shadow-xl shadow-black/5 p-6 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">{t('settings_ghost')}</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Hide your pulse from the network</p>
              </div>
              <Switch checked={settings.isGhostMode} onCheckedChange={(val) => handleUpdate({ isGhostMode: val })} />
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Read Receipts</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Let nodes know you've synced messages</p>
              </div>
              <Switch checked={settings.showReadReceipts} onCheckedChange={(val) => handleUpdate({ showReadReceipts: val })} />
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Private Account</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Limit full profile updates to approved followers</p>
              </div>
              <Switch checked={settings.isPrivateAccount} onCheckedChange={(val) => handleUpdate({ isPrivateAccount: val })} />
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Sensitive Content Filter</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Blur sensitive posts until you tap to view</p>
              </div>
              <Switch checked={settings.isSensitivityFilterActive} onCheckedChange={(val) => handleUpdate({ isSensitivityFilterActive: val })} />
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex flex-col gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Tagging Privacy</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Who can tag you in posts &amp; stories</p>
              </div>
              <div className="grid grid-cols-2 gap-2 bg-secondary/40 p-1.5 rounded-2xl">
                <button
                  onClick={() => handleUpdate({ taggingPrivacy: 'everyone' })}
                  className={cn(
                    "flex items-center justify-center px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.taggingPrivacy === 'everyone' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  Everyone
                </button>
                <button
                  onClick={() => handleUpdate({ taggingPrivacy: 'friends' })}
                  className={cn(
                    "flex items-center justify-center px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.taggingPrivacy === 'friends' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  Friends Only
                </button>
              </div>
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="flex flex-col gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-primary" />
                  <p className="font-bold text-sm">Discovery Visibility</p>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black">Who sees you in creator suggestions</p>
              </div>
              <div className="grid grid-cols-2 gap-2 bg-secondary/40 p-1.5 rounded-2xl">
                <button
                  onClick={() => handleUpdate({ discoveryVisibility: 'everyone' })}
                  className={cn(
                    "flex items-center justify-center px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.discoveryVisibility === 'everyone' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  Everyone
                </button>
                <button
                  onClick={() => handleUpdate({ discoveryVisibility: 'mutual' })}
                  className={cn(
                    "flex items-center justify-center px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    settings.discoveryVisibility === 'mutual' ? "bg-white dark:bg-zinc-800 text-primary shadow-md" : "text-muted-foreground"
                  )}
                >
                  Mutuals Only
                </button>
              </div>
            </div>

            <div className="h-px bg-border -mx-6" />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <p className="font-bold text-sm">Legacy Handshake</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Trusted node for vault management</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {settings.legacyContact && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10"
                      onClick={() => handleUpdate({ legacyContact: null })}
                      title="Remove Legacy Contact"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Dialog open={isLegacySelectorOpen} onOpenChange={setIsLegacySelectorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="h-9 px-4 rounded-xl border-primary/10 text-[9px] font-black uppercase tracking-widest gap-2">
                        {selectedLegacyNode ? `@${selectedLegacyNode.username}` : settings.legacyContact ? `@${settings.legacyContact}` : "Assign Node"}
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-t-[2.5rem] p-0 overflow-hidden border-primary/10 bg-white/95 dark:bg-[#050505]/95 backdrop-blur-3xl h-[60vh] flex flex-col">
                      <DialogHeader className="p-6 bg-primary/5 border-b border-primary/10">
                        <DialogTitle className="text-xl font-black italic uppercase tracking-widest">Select Legacy Node</DialogTitle>
                      </DialogHeader>
                      <div className="p-4 space-y-4 shrink-0">
                        <div className="relative group">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
                          <Input placeholder="Query established friends..." className="pl-10 h-12 bg-secondary/30 border-none rounded-2xl" value={legacySearch} onChange={(e) => setLegacySearch(e.target.value)} />
                        </div>
                      </div>
                      <ScrollArea className="flex-1 px-4">
                        <div className="space-y-2 pb-10">
                          {filteredConnections.length > 0 ? filteredConnections.map((c) => (
                            <button key={c.username} onClick={() => { handleUpdate({ legacyContact: c.username }); setIsLegacySelectorOpen(false); }} className={cn("w-full flex items-center justify-between p-3 rounded-2xl transition-all border", settings.legacyContact === c.username ? "bg-primary/10 border-primary/20" : "bg-transparent border-transparent hover:bg-secondary/40")}>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-primary/10"><AvatarImage src={c.avatar} /></Avatar>
                                <div className="text-left">
                                  <p className="font-bold text-sm leading-none">{c.name}</p>
                                  <p className="text-[10px] text-muted-foreground uppercase font-black mt-1">@{c.username}</p>
                                </div>
                              </div>
                              {settings.legacyContact === c.username && <CheckCircle2 className="h-5 w-5 text-primary" />}
                            </button>
                          )) : <div className="py-20 text-center opacity-40 italic text-xs uppercase">No mutual nodes found</div>}
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

            <div className="h-px bg-border -mx-6" />

            <button
              type="button"
              onClick={openBlockedManager}
              className="w-full flex items-center justify-between p-2 -mx-2 rounded-2xl hover:bg-secondary/40 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive group-hover:scale-105 transition-transform">
                  <Ban className="h-5 w-5" />
                </div>
                <div className="text-left space-y-0.5">
                  <p className="font-bold text-sm">Blocked &amp; Muted Users</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">
                    {blockedUsernames.length} blocked · {mutedUserNames.length} muted
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
            </button>
          </div>
        </section>

        <section className="pt-10">
          <AcronymCard />
        </section>

        <section className="pt-10 pb-20">
          <NativeAdNode type="banner-468" id="settings-bottom-pulse" />
          <Button variant="outline" className="w-full h-14 rounded-2xl border-destructive/20 text-destructive font-black italic uppercase tracking-widest text-[10px] hover:bg-destructive/5 transition-all active:scale-95 shadow-lg shadow-destructive/5 mt-8" onClick={logout}>
            {t('logout')}
          </Button>
          <p className="text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em] mt-6">ViMore Node v1.5.0-HighVelocity</p>
        </section>
      </main>

      {/* Security PIN Setup / Removal Dialog */}
      <Dialog open={isPinDialogOpen} onOpenChange={(open) => { if (!isSavingPin) setIsPinDialogOpen(open); }}>
        <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-primary/10 bg-white/95 dark:bg-[#050505]/95 backdrop-blur-3xl sm:max-w-[400px]">
          <DialogHeader className="p-6 bg-primary/5 border-b border-primary/10">
            <DialogTitle className="font-black italic uppercase tracking-widest text-xl text-primary">
              {pinMode === 'set' ? (hasSecurityPin ? "Change Security PIN" : "Set Security PIN") : "Remove Security PIN"}
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-muted-foreground pt-1">
              {pinMode === 'set'
                ? "Choose a 4–8 digit PIN to unlock Messages, Earnings, and Credit Hub on any device."
                : "Enter your current PIN or account password to remove your Security PIN."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePinSubmit}>
            <div className="p-6 space-y-4">
              {(hasSecurityPin || pinMode === 'remove') && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                    Current PIN or Account Password
                  </Label>
                  <Input
                    type="password"
                    value={currentCred}
                    onChange={(e) => setCurrentCred(e.target.value)}
                    placeholder="Enter current PIN or password"
                    className="h-12 bg-secondary/30 border-none rounded-xl"
                    disabled={isSavingPin}
                  />
                </div>
              )}

              {pinMode === 'set' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                      New 4–8 Digit PIN
                    </Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="h-12 bg-secondary/30 border-none rounded-xl tracking-[0.4em] text-center font-bold"
                      disabled={isSavingPin}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                      Confirm PIN
                    </Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="h-12 bg-secondary/30 border-none rounded-xl tracking-[0.4em] text-center font-bold"
                      disabled={isSavingPin}
                    />
                  </div>
                </>
              )}

              {pinError && (
                <p className="text-xs font-bold text-destructive bg-destructive/10 px-3 py-2 rounded-xl">
                  {pinError}
                </p>
              )}
            </div>
            <DialogFooter className="p-6 pt-0 gap-2">
              <Button type="button" variant="ghost" className="rounded-xl h-11 font-bold" onClick={() => setIsPinDialogOpen(false)} disabled={isSavingPin}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={pinMode === 'remove' ? "destructive" : "default"}
                disabled={isSavingPin}
                className="flex-1 rounded-xl h-11 font-black italic uppercase tracking-widest text-xs"
              >
                {isSavingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : pinMode === 'set' ? "Save PIN" : "Remove PIN"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Blocked & Muted Users Manager Dialog */}
      <Dialog open={isBlockedDialogOpen} onOpenChange={setIsBlockedDialogOpen}>
        <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-primary/10 bg-white/95 dark:bg-[#050505]/95 backdrop-blur-3xl sm:max-w-[440px] max-h-[75vh] flex flex-col">
          <DialogHeader className="p-6 bg-primary/5 border-b border-primary/10">
            <DialogTitle className="font-black italic uppercase tracking-widest text-xl flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" /> Blocked &amp; Muted Users
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-muted-foreground">
              Manage accounts you have blocked or muted across ViMore.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Blocked Users ({blockedList.length || blockedUsernames.length})
                </p>
                {isLoadingBlocked ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : blockedList.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">No blocked users.</p>
                ) : (
                  <div className="space-y-2">
                    {blockedList.map((u) => (
                      <div key={u.userId || u.username} className="flex items-center justify-between p-3 rounded-2xl bg-secondary/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={u.avatar} />
                            <AvatarFallback>{(u.name || u.username || 'U')[0]}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{u.name || u.username}</p>
                            <p className="text-[10px] text-muted-foreground font-black uppercase truncate">@{u.username}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl h-8 text-[10px] font-black uppercase"
                          onClick={async () => {
                            await unblockUser(u.username);
                            setBlockedList(prev => prev.filter(item => item.username !== u.username));
                            toast({ title: "Unblocked", description: `@${u.username} was unblocked.` });
                          }}
                        >
                          Unblock
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Muted Users ({mutedUserNames.length})
                </p>
                {mutedUserNames.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">No muted users.</p>
                ) : (
                  <div className="space-y-2">
                    {mutedUserNames.map((uname) => (
                      <div key={uname} className="flex items-center justify-between p-3 rounded-2xl bg-secondary/30">
                        <div className="flex items-center gap-2.5">
                          <VolumeX className="h-4 w-4 text-muted-foreground" />
                          <span className="font-bold text-sm">@{uname}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl h-8 text-[10px] font-black uppercase"
                          onClick={() => {
                            toggleMuteUser(uname);
                            toast({ title: "Unmuted", description: `@${uname} was unmuted.` });
                          }}
                        >
                          Unmute
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
