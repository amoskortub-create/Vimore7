"use client";

import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  UserCog, 
  ShieldCheck, 
  Mail, 
  Smartphone, 
  AtSign, 
  KeyRound, 
  Fingerprint, 
  Trash2, 
  Check, 
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldAlert,
  Shield,
  Zap,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { usePosts } from "@/context/PostContext";
import { useMusic } from "@/context/MusicContext";
import { useTranslation } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ProfileLoading from "@/app/profile/loading";

export default function AccountCenter() {
  const {
    currentUser,
    updateCurrentUser,
    triggerHaptic,
    settings,
    updateSettings,
    enrollHardwareBiometrics,
    hasSecurityPin,
    changePassword,
    deleteAccount,
    isLoading,
  } = usePosts();
  const { currentTrack, isExpanded } = useMusic();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    phone: ""
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setFormData({
        name: currentUser.name || "",
        username: currentUser.username || "",
        email: (currentUser as any).email || "",
        phone: (currentUser as any).phone || ""
      });
    }
  }, [currentUser]);

  // Password Change State
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSyncingPassword, setIsSyncingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: ""
  });

  // Delete Account 2-step State
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletePasswordOpen, setIsDeletePasswordOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isEnrolling, setIsEnrolling] = useState(false);

  if (isLoading || !currentUser) {
    return <ProfileLoading />;
  }

  const isPlayerActive = currentTrack && !isExpanded;
  void isPlayerActive;

  const handleSave = async () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Invalid Name", description: "Display name cannot be empty." });
      return;
    }

    setIsSavingProfile(true);
    triggerHaptic(25);
    try {
      const updates: any = { name: trimmedName };
      const normalized = formData.phone.replace(/[\s\-().]/g, '');
      const currentPhone = (currentUser?.phone || '').replace(/[\s\-().]/g, '');
      if (normalized !== currentPhone) {
        updates.phone = normalized;
      }
      await updateCurrentUser(updates);
      toast({ title: "Account Saved", description: "Your account details have been updated." });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: err?.message || "Could not update your account details.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      triggerHaptic(40);
      setPasswordError("Please fill in all password fields.");
      return;
    }
    if (passwords.new.length < 8 || passwords.new.length > 128) {
      triggerHaptic(40);
      setPasswordError("New password must be between 8 and 128 characters.");
      return;
    }
    if (passwords.new !== passwords.confirm) {
      triggerHaptic(40);
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    if (passwords.new === passwords.current) {
      triggerHaptic(40);
      setPasswordError("New password must be different from your current password.");
      return;
    }

    setIsSyncingPassword(true);
    triggerHaptic(30);
    try {
      await changePassword(passwords.current, passwords.new, passwords.confirm);
      setIsPasswordDialogOpen(false);
      setPasswords({ current: "", new: "", confirm: "" });
      setPasswordError(null);
      triggerHaptic(100);
      toast({
        title: "Password Changed",
        description: "Your password has been updated and older sessions were signed out.",
      });
    } catch (err: any) {
      triggerHaptic(80);
      const msg = err?.message || "Could not update your password. Check your current password.";
      setPasswordError(msg);
      toast({ variant: "destructive", title: "Password Change Failed", description: msg });
    } finally {
      setIsSyncingPassword(false);
    }
  };

  const handleToggle2FA = async () => {
    const nextState = !settings.isBiometricActive;
    triggerHaptic(10);

    if (!nextState) {
      updateSettings({ isBiometricActive: false });
      toast({
        title: "Device Lock Disabled",
        description: "Messages, Earnings, and Credit Hub are no longer locked.",
      });
      return;
    }

    if (settings.isHardwareEnrolled) {
      updateSettings({ isBiometricActive: true });
      toast({
        title: "Device Lock Active",
        description: "Messages and financial pages are now protected.",
      });
      return;
    }

    setIsEnrolling(true);
    const success = await enrollHardwareBiometrics();
    setIsEnrolling(false);

    if (success) {
      toast({
        title: "Biometric Protection Active",
        description: "Device biometrics enabled for your protected areas.",
      });
    } else {
      // Fall back cleanly to PIN / Account Password lock so Device Security always works
      updateSettings({ isBiometricActive: true });
      toast({
        title: "Device Lock Enabled",
        description: hasSecurityPin
          ? "Protected with your Security PIN and account password."
          : "Protected with your account password. You can also add a Security PIN in Settings.",
      });
    }
  };

  const handleProceedToPasswordDelete = () => {
    triggerHaptic(30);
    setIsDeleteConfirmOpen(false);
    setDeletePassword("");
    setDeleteError(null);
    setIsDeletePasswordOpen(true);
  };

  const handleConfirmDeleteAccount = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setDeleteError(null);

    if (!deletePassword) {
      setDeleteError("Please enter your password to confirm account deletion.");
      triggerHaptic(50);
      return;
    }

    setIsDeletingAccount(true);
    triggerHaptic(80);
    try {
      await deleteAccount(deletePassword);
      setIsDeletePasswordOpen(false);
      toast({
        title: "Account Access Removed",
        description: "Your account has been deactivated and all data will be permanently deleted after 90 days.",
      });
      router.replace("/login?reason=account-deleted");
    } catch (err: any) {
      triggerHaptic(100);
      setDeleteError(err?.message || "Incorrect password. Account was not deleted.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] dark:bg-[#050505] transition-colors duration-300">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-card/80 backdrop-blur-md border-b border-border h-16 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-secondary/80 active:scale-90 transition-all">
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-lg font-black italic uppercase tracking-tighter text-foreground leading-tight">{t('account_center')}</h1>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3 w-3 text-primary" />
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{t('ui_identity_vault')}</span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-[10px] font-black uppercase text-primary hover:bg-primary/5 rounded-xl h-9 px-4 gap-1.5"
          onClick={handleSave}
          disabled={isSavingProfile}
        >
          {isSavingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {t('ui_save_hub')}
        </Button>
      </header>

      <main className="max-w-xl mx-auto p-4 sm:p-8 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32 pt-4">
        
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Digital Identity</h3>
          <Card className="rounded-[2.5rem] bg-white dark:bg-card border-none shadow-xl shadow-black/5 overflow-hidden">
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Legal Pulse (Name)</Label>
                  <div className="relative group">
                    <UserCog className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                    <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="h-14 pl-12 bg-secondary/30 border-none rounded-2xl font-bold focus-visible:ring-primary/20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Spatial ID (Username)</Label>
                  <div className="relative">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={formData.username} readOnly className="h-14 pl-12 bg-secondary/10 border-none rounded-2xl font-bold text-muted-foreground cursor-not-allowed" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Contact Handshakes</h3>
          <Card className="rounded-[2.5rem] bg-white dark:bg-card border-none shadow-xl shadow-black/5 overflow-hidden">
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Email Node</Label>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Fixed sign-in ID</span>
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={formData.email} readOnly className="h-14 pl-12 bg-secondary/10 border-none rounded-2xl font-bold text-muted-foreground cursor-not-allowed" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Mobile Pulse</Label>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Optional · Used for sign-in</span>
                  </div>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="+1 555 000 0000"
                      className="h-14 pl-12 bg-secondary/30 border-none rounded-2xl font-bold focus-visible:ring-primary/20"
                    />
                  </div>
                  <p className="text-[9px] font-bold text-muted-foreground/60 pl-1">Include your country code. You can sign in with this number instead of your ViMore ID.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">{t('settings_security')}</h3>
          <div className="grid grid-cols-1 gap-3">
            <Button 
              variant="outline" 
              className="h-16 rounded-2xl border-primary/10 bg-white dark:bg-card justify-start gap-4 px-6 group hover:bg-primary/5 transition-all"
              onClick={() => {
                triggerHaptic(10);
                setPasswordError(null);
                setIsPasswordDialogOpen(true);
              }}
            >
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <KeyRound className="h-5 w-5" />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-bold text-sm">Change Password</span>
                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Update your sign-in password</span>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/40" />
            </Button>
            
            <Button 
              variant="outline" 
              className={cn(
                "h-16 rounded-2xl border-primary/10 bg-white dark:bg-card justify-start gap-4 px-6 group hover:bg-primary/5 transition-all",
                settings.isBiometricActive && "border-green-500/20 bg-green-500/5"
              )}
              onClick={handleToggle2FA}
              disabled={isEnrolling}
            >
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110",
                settings.isBiometricActive ? "bg-green-500 text-white" : "bg-green-500/10 text-green-500"
              )}>
                {isEnrolling ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
              </div>
              <div className="flex flex-col items-start">
                <span className="font-bold text-sm">Device &amp; Biometric Lock</span>
                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                  {isEnrolling
                    ? "Synchronizing..."
                    : settings.isBiometricActive
                      ? settings.isHardwareEnrolled
                        ? "Biometric Protection Active"
                        : hasSecurityPin
                          ? "Security PIN Protection Active"
                          : "Password Lock Active"
                      : "Protect Messages & Earnings"}
                </span>
              </div>
              <div className={cn(
                "ml-auto h-2 w-2 rounded-full",
                settings.isBiometricActive ? "bg-green-500 animate-pulse" : "bg-muted"
              )} />
            </Button>
          </div>
        </section>

        <div className="pt-10 flex flex-col items-center gap-6">
          <Button 
            variant="ghost" 
            className="text-destructive font-black uppercase text-[10px] tracking-widest gap-2 hover:bg-destructive/10 rounded-xl h-11 px-6 border border-destructive/20"
            onClick={() => { triggerHaptic(20); setIsDeleteConfirmOpen(true); }}
          >
            <Trash2 className="h-4 w-4" /> Delete My Account
          </Button>
          <div className="opacity-30 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-foreground">Account Core v1.5</p>
            <p className="text-[8px] font-bold uppercase tracking-widest text-primary italic">© 2026 ViMore by Media Tech Liberia</p>
          </div>
        </div>
      </main>

      {/* 1. Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => { setIsPasswordDialogOpen(open); if (!open) setPasswordError(null); }}>
        <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-primary/10 bg-white/95 dark:bg-[#050505]/95 backdrop-blur-3xl sm:max-w-[400px]">
          <DialogHeader className="p-6 bg-primary/5 border-b border-primary/10">
            <DialogTitle className="font-black italic uppercase tracking-widest text-2xl text-primary">Change Password</DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Current Password</Label>
                <div className="relative">
                  <Input 
                    type={showCurrentPassword ? "text" : "password"}
                    value={passwords.current}
                    onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                    className="h-12 bg-secondary/30 border-none rounded-xl pr-10"
                    placeholder="Enter current password"
                  />
                  <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">New Password (8+ chars)</Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={passwords.new}
                    onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                    className="h-12 bg-secondary/30 border-none rounded-xl pr-10"
                    placeholder="Enter new password"
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Confirm New Password</Label>
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                  className="h-12 bg-secondary/30 border-none rounded-xl"
                  placeholder="Re-enter new password"
                />
              </div>
            </div>

            {passwordError && (
              <p className="text-xs font-bold text-destructive bg-destructive/10 px-3 py-2.5 rounded-xl">
                {passwordError}
              </p>
            )}

            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex gap-3">
              <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[10px] font-bold text-primary/70 uppercase leading-relaxed tracking-tight">
                Changing your password will sign out all other devices connected to your account.
              </p>
            </div>
          </div>
          <DialogFooter className="p-6 pt-0">
            <Button className="w-full h-14 rounded-2xl bg-primary text-white font-black italic uppercase tracking-widest gap-2 shadow-xl shadow-primary/20" onClick={handleChangePassword} disabled={isSyncingPassword}>
              {isSyncingPassword ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5 fill-current" />}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2A. Delete My Account — Step 1 Confirmation Warning */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent className="rounded-[2.5rem] sm:max-w-[420px] bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-3xl border-destructive/20 shadow-2xl">
          <AlertDialogHeader>
            <div className="mx-auto h-16 w-16 bg-destructive/10 rounded-2xl flex items-center justify-center text-destructive mb-4">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <AlertDialogTitle className="font-black italic uppercase tracking-tighter text-2xl text-center text-destructive">
              Delete My Account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium leading-relaxed text-center px-2 space-y-2">
              <span className="block font-bold text-foreground">
                This action cannot be undone.
              </span>
              <span className="block">
                If you continue, your access to this account will be removed immediately, and all of your account data will be permanently deleted after 90 days.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-3 pt-4 px-2 pb-2">
            <AlertDialogCancel className="rounded-2xl h-12 font-black uppercase tracking-widest text-[10px] bg-secondary/50 border-none hover:bg-secondary transition-all">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleProceedToPasswordDelete();
              }}
              className="rounded-2xl h-12 font-black italic uppercase tracking-widest text-[10px] bg-destructive hover:bg-destructive/90 text-white shadow-xl shadow-destructive/20 transition-all active:scale-95"
            >
              I Agree, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 2B. Delete My Account — Step 2 Password Confirmation */}
      <Dialog
        open={isDeletePasswordOpen}
        onOpenChange={(open) => {
          if (!isDeletingAccount) {
            setIsDeletePasswordOpen(open);
            if (!open) {
              setDeletePassword("");
              setDeleteError(null);
            }
          }
        }}
      >
        <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-destructive/20 bg-white/95 dark:bg-[#050505]/95 backdrop-blur-3xl sm:max-w-[420px]">
          <DialogHeader className="p-6 bg-destructive/10 border-b border-destructive/15">
            <DialogTitle className="font-black italic uppercase tracking-tight text-xl text-destructive flex items-center gap-2">
              <Lock className="h-5 w-5" /> Confirm Account Deletion
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-muted-foreground pt-1">
              Enter your account password to permanently remove access now and schedule full data deletion in 90 days. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmDeleteAccount}>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Account Password
                </Label>
                <div className="relative">
                  <Input
                    type={showDeletePassword ? "text" : "password"}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password to confirm"
                    className="h-12 bg-secondary/30 border-none rounded-xl pr-10"
                    autoFocus
                    disabled={isDeletingAccount}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                  >
                    {showDeletePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {deleteError && (
                <p className="text-xs font-bold text-destructive bg-destructive/10 px-3 py-2.5 rounded-xl">
                  {deleteError}
                </p>
              )}
            </div>
            <DialogFooter className="p-6 pt-0 flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-2xl h-12 font-black uppercase tracking-widest text-[10px]"
                onClick={() => setIsDeletePasswordOpen(false)}
                disabled={isDeletingAccount}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isDeletingAccount || !deletePassword}
                className="flex-1 rounded-2xl h-12 font-black italic uppercase tracking-widest text-[11px] gap-2 shadow-xl shadow-destructive/20"
              >
                {isDeletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeletingAccount ? "Deleting Account..." : "Delete My Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}