"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { usePosts } from "@/context/PostContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MIN_WITHDRAW_CREDITS,
  WITHDRAW_RATE_LD,
  WITHDRAW_RATE_USD,
} from "@/lib/credit-monetization";

type WithdrawRecord = {
  $id: string;
  amountCredits: number;
  amountLD: number;
  amountUSD: number;
  method: string;
  status: string;
  reason?: string;
  adminMessage?: string;
  accountLast4?: string;
  createdAt: string;
};

export function WithdrawCredits() {
  const { currentUser, applyCreditBalance } = usePosts();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"MTN MoMo" | "Orange Money">("MTN MoMo");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [history, setHistory] = useState<WithdrawRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const balance = Number(currentUser?.creditBalance ?? currentUser?.diamondBalance ?? 0);
  const credits = Number(amount) || 0;
  const previewLD = useMemo(() => Math.round(credits * WITHDRAW_RATE_LD * 100) / 100, [credits]);

  const loadHistory = async () => {
    try {
      const response = await authFetch("/api/withdraw");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load withdrawal history.");
      setHistory(data.requests || []);
      if (Number.isFinite(Number(data.creditBalance))) applyCreditBalance(Number(data.creditBalance));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Withdrawal history unavailable", description: error.message });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [currentUser?.$id]);

  const handleSubmit = async () => {
    if (credits < MIN_WITHDRAW_CREDITS || credits > balance || !accountName.trim() || !accountNumber.trim()) return;
    setIsSubmitting(true);
    try {
      const response = await authFetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCredits: credits, method, accountName: accountName.trim(), accountNumber: accountNumber.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Withdrawal request failed.");
      applyCreditBalance(data.newBalance);
      setAmount("");
      setAccountName("");
      setAccountNumber("");
      await loadHistory();
      toast({ title: "Withdrawal requested", description: "Your Credits are reserved while the request is pending." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Withdrawal failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-5 rounded-3xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest">Withdraw Credits</h2>
        <p className="mt-1 text-xs text-muted-foreground">Available Credit Balance: {balance.toFixed(2)} Credits</p>
        <p className="text-xs text-muted-foreground">Withdrawable Credits: {balance.toFixed(2)} Credits</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-bold">Amount in Credits</label>
          <Input type="number" min={MIN_WITHDRAW_CREDITS} max={balance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">Method</label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            <option value="MTN MoMo">MTN MoMo</option>
            <option value="Orange Money">Orange Money</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">Account Name</label>
          <Input autoComplete="name" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">Account Number</label>
          <Input autoComplete="off" inputMode="tel" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} />
        </div>
      </div>

      <div className="rounded-2xl bg-primary/5 p-4 text-sm">
        <p className="font-bold">You will receive: L$ {previewLD.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">Rate: 1 Credit = {WITHDRAW_RATE_USD} USD = {WITHDRAW_RATE_LD} LD</p>
      </div>

      {credits < MIN_WITHDRAW_CREDITS && (
        <p className="text-xs font-bold text-amber-600">Minimum withdraw is {MIN_WITHDRAW_CREDITS} Credits</p>
      )}
      {credits > balance && <p className="text-xs font-bold text-destructive">Insufficient Credit Balance.</p>}
      <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || credits < MIN_WITHDRAW_CREDITS || credits > balance || !accountName.trim() || !accountNumber.trim()}>
        {isSubmitting ? "Submitting..." : "Request Withdraw"}
      </Button>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-xs font-black uppercase tracking-widest">Withdraw History</h3>
        {isLoadingHistory ? <p className="text-xs text-muted-foreground">Loading history...</p> : history.length ? history.map((record) => (
          <div key={record.$id} className="flex items-start justify-between gap-3 rounded-xl bg-secondary/30 p-3">
            <div>
              <p className="text-sm font-bold">{Number(record.amountCredits).toFixed(2)} Credits · L$ {Number(record.amountLD).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{record.method} · {new Date(record.createdAt).toLocaleDateString()}</p>
              {record.status === "paid" && <p className="text-xs text-emerald-600">Withdraw Approved - Paid to {record.method}{record.accountLast4 ? ` ••••${record.accountLast4}` : ""}{record.adminMessage ? ` · ${record.adminMessage}` : ""}</p>}
              {record.status === "rejected" && <p className="text-xs text-destructive">Rejected · {record.reason}</p>}
            </div>
            <span className="text-[10px] font-black uppercase">{record.status}</span>
          </div>
        )) : <p className="text-xs text-muted-foreground">No withdrawals yet.</p>}
      </div>
    </section>
  );
}
