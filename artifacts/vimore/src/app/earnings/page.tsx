"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Gem, HelpCircle, Loader2, Send, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePosts } from "@/context/PostContext";
import { useMusic } from "@/context/MusicContext";
import { authFetch } from "@/lib/auth-fetch";
import { WITHDRAW_RATE_LD, WITHDRAW_RATE_USD } from "@/lib/credit-monetization";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WithdrawCredits } from "@/components/monetization/withdraw-credits";
import { BiometricGate } from "@/components/layout/biometric-gate";
import { cn } from "@/lib/utils";

type Earnings = {
  totalEarningsCredits: number;
  giftsEarningsCredits: number;
  subscriptionsEarningsCredits: number;
  lockedPostsEarningsCredits: number;
  lockedMusicEarningsCredits: number;
};

const EMPTY_EARNINGS: Earnings = {
  totalEarningsCredits: 0,
  giftsEarningsCredits: 0,
  subscriptionsEarningsCredits: 0,
  lockedPostsEarningsCredits: 0,
  lockedMusicEarningsCredits: 0,
};

export default function EarningsPage() {
  const { currentUser, submitTicket, isLoading } = usePosts();
  const { currentTrack, isExpanded } = useMusic();
  const { toast } = useToast();
  const [earnings, setEarnings] = useState(EMPTY_EARNINGS);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    authFetch("/api/monetization/earnings-summary")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load earnings.");
        if (data.earnings) setEarnings({ ...EMPTY_EARNINGS, ...data.earnings });
      })
      .catch((error) => toast({ variant: "destructive", title: "Earnings unavailable", description: error.message }));
  }, [currentUser?.$id, toast]);

  const credits = Number(currentUser?.creditBalance ?? currentUser?.diamondBalance ?? 0);
  const totalUSD = credits * WITHDRAW_RATE_USD;
  const totalLD = credits * WITHDRAW_RATE_LD;
  const isPlayerActive = currentTrack && !isExpanded;

  const handleSubmitTicket = async () => {
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    setIsSubmittingTicket(true);
    try {
      await submitTicket({ subject: ticketSubject.trim(), message: ticketMessage.trim(), category: "Finance", priority: "HIGH" });
      toast({ title: "Support request sent", description: "Our team will review your withdrawal or earnings issue." });
      setTicketOpen(false);
      setTicketSubject("");
      setTicketMessage("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not contact support", description: error.message });
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  if (isLoading || !currentUser) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const stats: [string, number][] = [
    ["Gifts Credits", earnings.giftsEarningsCredits],
    ["Subscriptions Credits", earnings.subscriptionsEarningsCredits],
    ["Locked Posts Credits", earnings.lockedPostsEarningsCredits],
    ["Locked Music Credits", earnings.lockedMusicEarningsCredits],
  ];

  return (
    <BiometricGate title="Earnings Portal">
      <div className={cn("min-h-screen bg-[#F0F2F5] dark:bg-[#060608]", isPlayerActive && "pb-24")}>
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl">
          <Link href="/menu"><Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div className="flex-1">
            <h1 className="text-base font-black uppercase tracking-tight">Earnings Portal</h1>
            <p className="text-[9px] font-bold uppercase tracking-widest text-primary">Creator Credits</p>
          </div>
          <Avatar className="h-9 w-9 border border-primary/20">
            <AvatarImage src={currentUser.avatar} />
            <AvatarFallback>{(currentUser.name || "V")[0]}</AvatarFallback>
          </Avatar>
        </header>

        <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
          <section className="rounded-3xl bg-gradient-to-br from-[#0f1a3d] via-[#1a0533] to-[#0a2620] p-6 text-white shadow-xl">
            <div className="flex items-center gap-2 text-white/60"><Gem className="h-4 w-4 text-cyan-400" /><span className="text-xs font-black uppercase tracking-widest">Credit Balance</span></div>
            <p className="mt-2 text-3xl font-black tabular-nums">{credits.toFixed(2)} Credits</p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/50">Total Conversion Estimate</p>
              <p className="mt-1 text-lg font-black text-emerald-300">${totalUSD.toFixed(2)} <span className="text-white/40">/</span> L$ {totalLD.toLocaleString()}</p>
              <p className="text-[10px] text-white/50">1 Credit = {WITHDRAW_RATE_USD} USD = {WITHDRAW_RATE_LD} LD</p>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /><h2 className="text-sm font-black uppercase tracking-widest">Total Earned Credits</h2></div>
            <p className="mb-4 text-2xl font-black">{Number(earnings.totalEarningsCredits).toFixed(2)} Credits</p>
            <div className="grid grid-cols-2 gap-3">
              {stats.map(([label, amount]) => (
                <div key={label} className="rounded-2xl bg-secondary/40 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-black">{Number(amount).toFixed(2)} Credits</p>
                </div>
              ))}
            </div>
          </section>

          <WithdrawCredits />

          <button onClick={() => setTicketOpen(true)} className="flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-4 text-left shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><HelpCircle className="h-5 w-5 text-primary" /></span>
            <span><span className="block text-sm font-black uppercase">Contact Support</span><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Withdraw or earnings issue?</span></span>
          </button>
        </main>

        {ticketOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
            <section className="w-full max-w-md space-y-4 rounded-3xl bg-background p-5">
              <div className="flex items-center justify-between"><h2 className="font-black uppercase">Contact Support</h2><button onClick={() => setTicketOpen(false)} aria-label="Close">×</button></div>
              <Input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} placeholder="Subject" />
              <textarea value={ticketMessage} onChange={(event) => setTicketMessage(event.target.value)} placeholder="Describe your issue" rows={5} className="w-full rounded-md border border-input bg-background p-3 text-sm" />
              <Button className="w-full" disabled={isSubmittingTicket || !ticketSubject.trim() || !ticketMessage.trim()} onClick={handleSubmitTicket}>
                {isSubmittingTicket ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send to Support
              </Button>
            </section>
          </div>
        )}
      </div>
    </BiometricGate>
  );
}
