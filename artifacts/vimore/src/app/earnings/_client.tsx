"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft,
  Gem,
  TrendingUp,
  ChevronRight,
  ArrowDownToLine,
  CheckCircle2,
  History,
  Building2,
  Smartphone,
  X,
  Loader2,
  CircleDashed,
  HelpCircle,
  Send,
  DollarSign,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePosts } from "@/context/PostContext";
import { useNotifications } from "@/context/NotificationContext";
import { useTranslation } from "@/context/LanguageContext";
import { safeJson } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { BiometricGate } from "@/components/layout/biometric-gate";
import { authFetch } from "@/lib/auth-fetch";
import { CREDIT_LIMITS } from "@/lib/credit-pricing";

export default function EarningsPage() {
  const {
    currentUser,
    triggerHaptic,
    withdrawalHistory,
    recordWithdrawal,
    submitTicket,
    isLoading,
  } = usePosts();
  const { addSignal } = useNotifications();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [isPortalOpen, setIsPortalOpen] = useState(false);
  const [earnings, setEarnings] = useState<{
    totalCredits: number;
    giftsCredits: number;
    subscriptionsCredits: number;
    lockedPostsCredits: number;
    lockedMusicCredits: number;
    lastUpdated?: string | null;
  }>({
    totalCredits: 0,
    giftsCredits: 0,
    subscriptionsCredits: 0,
    lockedPostsCredits: 0,
    lockedMusicCredits: 0,
    lastUpdated: null,
  });

  useEffect(() => {
    if (!currentUser) return;
    authFetch("/api/monetization/earnings-summary")
      .then((response) => safeJson<any>(response, {}))
      .then((summary) => {
        if (summary?.earnings) setEarnings(summary.earnings);
      })
      .catch(() => {});
  }, [currentUser?.$id]);

  const creditBalance = useMemo(() => {
    return Number(currentUser?.creditBalance ?? currentUser?.diamondBalance ?? 0);
  }, [currentUser]);

  const balanceUsd = useMemo(() => {
    return Math.round(creditBalance * CREDIT_LIMITS.creditUsdRate * 100) / 100;
  }, [creditBalance]);

  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("Finance");
  const [ticketMessage, setTicketMessage] = useState("");
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  const handleSubmitTicket = async () => {
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    setIsSubmittingTicket(true);
    try {
      await submitTicket({
        subject: ticketSubject,
        message: ticketMessage,
        category: ticketCategory,
        priority: "HIGH",
      });
      toast({
        title: "Ticket Submitted",
        description: "Our team will review your issue shortly.",
      });
      setIsTicketOpen(false);
      setTicketSubject("");
      setTicketMessage("");
      setTicketCategory("Finance");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Failed to Submit Ticket",
        description: e.message,
      });
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const [payoutMethod, setPayoutMethod] = useState<"ORANGE" | "MTN" | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rawAmount = parseFloat(amount) || 0;
  const roundedCreditAmount = Math.round(rawAmount * 100) / 100;
  const payoutUsd = useMemo(() => {
    return Math.round(roundedCreditAmount * CREDIT_LIMITS.creditUsdRate * 100) / 100;
  }, [roundedCreditAmount]);

  const hasEnoughBalance = useMemo(() => {
    return roundedCreditAmount > 0 && roundedCreditAmount <= creditBalance;
  }, [roundedCreditAmount, creditBalance]);

  const canProceed =
    Boolean(payoutMethod) &&
    accountName.trim().length > 0 &&
    accountNumber.trim().length > 0 &&
    hasEnoughBalance;

  const resetPortal = () => {
    setPayoutMethod(null);
    setAccountName("");
    setAccountNumber("");
    setAmount("");
  };

  const handleInitiateWithdrawal = async () => {
    if (!canProceed || !payoutMethod) return;
    setIsSubmitting(true);
    triggerHaptic(50);
    const methodLabel = payoutMethod === "ORANGE" ? "Orange Money" : "MTN MoMo";
    try {
      await recordWithdrawal({
        amount: roundedCreditAmount,
        currency: "DIAMOND",
        payoutAmount: payoutUsd,
        payoutCurrency: "USD",
        method: methodLabel,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
      });
      addSignal({
        type: "SYSTEM",
        title: "Withdrawal Pending",
        content: `Your request to withdraw **${roundedCreditAmount} Credits ($${payoutUsd.toFixed(2)} USD)** via **${methodLabel}** has been submitted for admin review.`,
      });
      toast({
        title: "Withdrawal Request Sent",
        description: `$${payoutUsd.toFixed(2)} USD via ${methodLabel} is now pending review.`,
      });
      setIsPortalOpen(false);
      resetPortal();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Withdrawal Failed",
        description: e.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !currentUser) {
    return (
      <div className="min-h-screen bg-[#060608] flex flex-col items-center justify-center p-6 space-y-4">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full" />
          <Wallet className="relative h-12 w-12 text-primary animate-pulse" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 animate-pulse">
          Fetching Vault Assets...
        </p>
      </div>
    );
  }

  return (
    <BiometricGate title="Earnings Portal">
      <div className="min-h-screen bg-[#F0F2F5] dark:bg-[#060608] transition-colors duration-300">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/90 dark:bg-[#0D0D12]/90 backdrop-blur-xl border-b border-black/5 dark:border-white/5 h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/menu">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-10 w-10 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-base font-black italic uppercase tracking-tighter leading-none">
                {t("earn_portal")}
              </h1>
              <p className="text-[9px] font-bold text-primary uppercase tracking-widest">
                {t("earn_financial_intel")}
              </p>
            </div>
          </div>
          <Avatar className="h-9 w-9 border-2 border-primary/20">
            <AvatarImage src={currentUser?.avatar} />
            <AvatarFallback className="text-xs font-black">
              {(currentUser?.name || "V")[0]}
            </AvatarFallback>
          </Avatar>
        </header>

        <main className="max-w-2xl mx-auto px-4 pb-32 space-y-5 pt-6">
          {/* Vault Hero */}
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0f1a3d] via-[#1a0533] to-[#0a2620] p-6 shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(168,85,247,0.25),_transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.15),_transparent_60%)]" />
            <div className="relative z-10 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-0.5">
                    {t("earn_available_energy")}
                  </p>
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">
                    {t("earn_vault_balance")}
                  </h2>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                  <TrendingUp className="h-6 w-6 text-emerald-400" />
                </div>
              </div>

              {/* Credit balance card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-7 w-7 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                    <Gem className="h-4 w-4 text-cyan-400" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/50">
                    Credit Balance
                  </span>
                </div>
                <p className="text-3xl font-black italic text-white tabular-nums">
                  {creditBalance.toFixed(2)}{" "}
                  <span className="text-sm not-italic font-black text-cyan-400">
                    Credits
                  </span>
                </p>
                <p className="text-[10px] text-white/50 font-bold mt-1">
                  1 Credit = $0.01 USD · Creators keep 80% on gifts, unlocks & subscriptions
                </p>
              </div>

              {/* USD Real-World Value */}
              <div className="bg-white/10 rounded-2xl p-4 border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">
                    Real-World Value
                  </p>
                  <span className="text-2xl font-black text-emerald-400 tabular-nums">
                    ${balanceUsd.toFixed(2)} USD
                  </span>
                </div>
                <Button
                  onClick={() => {
                    triggerHaptic(20);
                    setIsPortalOpen(true);
                  }}
                  className="h-12 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black italic uppercase tracking-widest text-xs gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Withdraw
                </Button>
              </div>
            </div>
          </div>

          {/* Creator Earnings Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Total Creator Earnings",
                value: `${earnings.totalCredits.toFixed(2)} C`,
                icon: TrendingUp,
                color: "cyan",
              },
              {
                label: "Gifts Earned (80%)",
                value: `${earnings.giftsCredits.toFixed(2)} C`,
                icon: CheckCircle2,
                color: "purple",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white dark:bg-white/5 rounded-[1.25rem] p-4 border border-black/5 dark:border-white/5 text-center shadow-sm"
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-xl mx-auto mb-2 flex items-center justify-center",
                    stat.color === "cyan" ? "bg-cyan-500/10" : "bg-primary/10"
                  )}
                >
                  <stat.icon
                    className={cn(
                      "h-4 w-4",
                      stat.color === "cyan" ? "text-cyan-500" : "text-primary"
                    )}
                  />
                </div>
                <p className="text-base font-black tabular-nums">{stat.value}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <section className="grid grid-cols-2 gap-3">
            {[
              ["Subscriptions (80%)", `${earnings.subscriptionsCredits.toFixed(2)} C`],
              ["Locked Posts (80%)", `${earnings.lockedPostsCredits.toFixed(2)} C`],
              ["Locked Music (80%)", `${earnings.lockedMusicCredits.toFixed(2)} C`],
              [
                "Last Credit Earned",
                earnings.lastUpdated
                  ? new Date(earnings.lastUpdated).toLocaleDateString()
                  : "None",
              ],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl p-3"
              >
                <p className="text-[9px] font-black uppercase text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-sm font-black">{value}</p>
              </div>
            ))}
          </section>

          {/* Support */}
          <button
            onClick={() => {
              triggerHaptic(10);
              setIsTicketOpen(true);
            }}
            className="w-full flex items-center gap-4 bg-white dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-[1.5rem] p-4 hover:border-primary/20 transition-all shadow-sm active:scale-[0.98] group"
          >
            <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <HelpCircle className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-black italic uppercase tracking-tight">
                Contact Support
              </span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Need help with a Credit withdrawal or payout?
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
          </button>

          {/* Withdrawal History */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
                {t("earn_audit_trail")}
              </h3>
              {withdrawalHistory.length > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[9px] font-black ml-auto"
                >
                  {withdrawalHistory.length}
                </Badge>
              )}
            </div>

            {withdrawalHistory.length > 0 ? (
              <div className="space-y-2">
                {withdrawalHistory.map((node) => {
                  const status = String(node.status || "PENDING").toUpperCase();
                  const payoutNum = Number(node.payoutAmount ?? node.payout_amount ?? 0);
                  const payoutCur = node.payoutCurrency || node.payout_currency || "USD";
                  const accNum = node.accountNumber || node.account_number || "";
                  return (
                    <div
                      key={node.$id}
                      className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/5 p-4 rounded-[1.5rem] flex items-center justify-between gap-3 shadow-sm hover:border-primary/10 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "h-11 w-11 rounded-2xl flex items-center justify-center shrink-0",
                            status === "PENDING"
                              ? "bg-amber-500/10"
                              : status === "REJECTED"
                              ? "bg-red-500/10"
                              : "bg-emerald-500/10"
                          )}
                        >
                          {status === "PENDING" ? (
                            <CircleDashed className="h-5 w-5 text-amber-500 animate-spin" />
                          ) : status === "REJECTED" ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black tabular-nums">
                            {payoutCur} {payoutNum.toFixed(2)}{" "}
                            <span className="text-[11px] font-bold text-muted-foreground">
                              ({Number(node.amount || 0).toFixed(2)} Credits)
                            </span>
                          </p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">
                            {node.method} {accNum ? `· ${accNum}` : ""} ·{" "}
                            {new Date(node.$createdAt || Date.now()).toLocaleDateString()}
                          </p>
                          {(node.admin_message || node.adminMessage) && (
                            <p className="text-[10px] font-medium text-muted-foreground mt-0.5 truncate">
                              {node.admin_message || node.adminMessage}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        className={cn(
                          "font-black text-[8px] uppercase tracking-tighter border-none h-5 px-2.5 shrink-0",
                          status === "PENDING"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : status === "REJECTED"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-14 flex flex-col items-center gap-4 bg-white/50 dark:bg-white/5 border border-dashed border-primary/10 rounded-[2rem] text-center">
                <div className="h-16 w-16 rounded-[1.25rem] bg-primary/5 flex items-center justify-center border border-dashed border-primary/20">
                  <DollarSign className="h-8 w-8 text-primary/20" />
                </div>
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/50">
                  No withdrawals yet
                </p>
              </div>
            )}
          </section>
        </main>

        {/* Credit Withdrawal Portal */}
        {isPortalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col animate-in fade-in duration-300">
            <header className="h-16 px-4 flex items-center justify-between shrink-0 border-b border-white/5">
              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:text-white rounded-full"
                onClick={() => {
                  setIsPortalOpen(false);
                  resetPortal();
                }}
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="text-center">
                <h2 className="text-sm font-black italic uppercase tracking-widest text-white">
                  Withdraw Credits
                </h2>
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                  1 Credit = $0.01 USD
                </p>
              </div>
              <div className="w-10" />
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="max-w-sm mx-auto space-y-5">
                {/* Payout method */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 text-center">
                    Choose Payout Network
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        triggerHaptic(10);
                        setPayoutMethod("ORANGE");
                      }}
                      className={cn(
                        "h-24 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all",
                        payoutMethod === "ORANGE"
                          ? "bg-orange-500 border-orange-400"
                          : "bg-white/5 border-white/10 hover:border-white/20"
                      )}
                    >
                      <Smartphone
                        className={cn(
                          "h-6 w-6",
                          payoutMethod === "ORANGE" ? "text-white" : "text-white/40"
                        )}
                      />
                      <span
                        className={cn(
                          "text-[10px] font-black uppercase tracking-widest",
                          payoutMethod === "ORANGE" ? "text-white" : "text-white/40"
                        )}
                      >
                        Orange Money
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        triggerHaptic(10);
                        setPayoutMethod("MTN");
                      }}
                      className={cn(
                        "h-24 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all",
                        payoutMethod === "MTN"
                          ? "bg-yellow-400 border-yellow-300"
                          : "bg-white/5 border-white/10 hover:border-white/20"
                      )}
                    >
                      <Building2
                        className={cn(
                          "h-6 w-6",
                          payoutMethod === "MTN" ? "text-black" : "text-white/40"
                        )}
                      />
                      <span
                        className={cn(
                          "text-[10px] font-black uppercase tracking-widest",
                          payoutMethod === "MTN" ? "text-black" : "text-white/40"
                        )}
                      >
                        MTN MoMo
                      </span>
                    </button>
                  </div>
                </div>

                {/* Account details */}
                <div className="bg-white/5 border border-white/10 rounded-[1.5rem] p-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">
                      Account Name
                    </Label>
                    <Input
                      placeholder="Full Registered Name"
                      className="h-12 bg-white/5 border-white/10 text-white font-bold focus-visible:ring-primary/40 placeholder:text-white/20 rounded-xl"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">
                      Mobile Money Number
                    </Label>
                    <Input
                      placeholder="07... / 08... / +231..."
                      className="h-12 bg-white/5 border-white/10 text-white font-bold focus-visible:ring-primary/40 placeholder:text-white/20 rounded-xl"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                    />
                  </div>
                </div>

                {/* Amount */}
                <div className="bg-white/5 border border-white/10 rounded-[1.5rem] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">
                      Credits to Withdraw
                    </Label>
                    <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-3 py-1">
                      <Gem className="h-3 w-3 text-cyan-400" />
                      <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">
                        Avail: {creditBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min="1"
                      step="any"
                      placeholder="0"
                      className={cn(
                        "h-16 bg-white/5 border-white/10 rounded-xl text-3xl font-black italic text-white px-5 focus-visible:ring-primary/40 placeholder:text-white/20",
                        roundedCreditAmount > 0 &&
                          !hasEnoughBalance &&
                          "text-red-400 border-red-500/40"
                      )}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    {roundedCreditAmount > 0 && !hasEnoughBalance && (
                      <p className="text-[10px] text-red-400 font-bold uppercase px-1">
                        Insufficient Credit balance
                      </p>
                    )}
                  </div>
                </div>

                {/* Real-world Payout preview */}
                {roundedCreditAmount > 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/50">
                        Real-World Payout
                      </p>
                      <p className="text-[10px] text-emerald-400/80 font-bold">
                        {roundedCreditAmount} Credits × $0.01 USD
                      </p>
                    </div>
                    <span className="text-2xl font-black italic text-emerald-400 tabular-nums">
                      ${payoutUsd.toFixed(2)} USD
                    </span>
                  </div>
                )}

                <Button
                  className={cn(
                    "w-full h-14 rounded-2xl font-black italic uppercase tracking-[0.2em] text-base transition-all",
                    canProceed && !isSubmitting
                      ? "bg-emerald-500 text-black shadow-xl shadow-emerald-500/20 hover:bg-emerald-400"
                      : "bg-white/5 text-white/20 cursor-not-allowed"
                  )}
                  onClick={handleInitiateWithdrawal}
                  disabled={!canProceed || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing...
                    </>
                  ) : (
                    "Submit Withdrawal Request"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Support Ticket */}
        {isTicketOpen && (
          <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-2xl flex flex-col animate-in fade-in duration-300">
            <header className="h-16 px-4 flex items-center justify-between shrink-0 border-b border-white/5">
              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:text-white rounded-full"
                onClick={() => setIsTicketOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="text-center">
                <h2 className="text-sm font-black italic uppercase tracking-widest text-white">
                  Support Ticket
                </h2>
                <p className="text-[10px] text-primary font-bold uppercase tracking-widest">
                  Earnings Help
                </p>
              </div>
              <div className="w-10" />
            </header>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="max-w-sm mx-auto space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">
                    Subject
                  </label>
                  <input
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="Describe your issue..."
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-white/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {["Finance", "Technical", "Identity", "Rewards", "Other"].map(
                      (cat) => (
                        <button
                          key={cat}
                          onClick={() => setTicketCategory(cat)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                            ticketCategory === cat
                              ? "bg-primary text-white"
                              : "bg-white/5 text-white/40"
                          )}
                        >
                          {cat}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">
                    Message
                  </label>
                  <textarea
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    placeholder="Provide details..."
                    rows={5}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none placeholder:text-white/20"
                  />
                </div>
                <Button
                  className={cn(
                    "w-full h-14 rounded-2xl font-black italic uppercase tracking-widest transition-all gap-3",
                    ticketSubject && ticketMessage && !isSubmittingTicket
                      ? "bg-primary text-white shadow-xl"
                      : "bg-white/5 text-white/20 cursor-not-allowed"
                  )}
                  onClick={handleSubmitTicket}
                  disabled={!ticketSubject || !ticketMessage || isSubmittingTicket}
                >
                  {isSubmittingTicket ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" /> Submit Ticket
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </BiometricGate>
  );
}
