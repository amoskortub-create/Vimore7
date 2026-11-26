"use client";

import { useState, useRef } from "react";
import {
  X,
  Gem,
  CheckCircle2,
  Loader2,
  Search,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePosts } from "@/context/PostContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { GIFT_CATEGORIES, GIFT_ITEMS } from "@/lib/ld-monetization";
import { CREDIT_LIMITS } from "@/lib/credit-pricing";

interface GiftItem {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  category: string;
}

const ALL_CATEGORIES = [
  { id: "all", label: "All", emoji: "🎁" },
  ...GIFT_CATEGORIES,
];

const ALL_GIFTS: GiftItem[] = GIFT_ITEMS.map((gift) => ({
  id: gift.id,
  name: gift.name,
  emoji: gift.emoji,
  cost: gift.priceCredits,
  category: gift.category,
}));

export function GiftHub() {
  const {
    isGiftHubOpen,
    closeGiftHub,
    currentUser,
    targetUserForGift,
    processGiftTransaction,
    triggerHaptic,
  } = usePosts();
  const { toast } = useToast();

  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedGift, setSelectedGift] = useState<GiftItem | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const userBalance = Number(
    currentUser?.creditBalance ?? currentUser?.diamondBalance ?? 0
  );

  const filteredGifts = ALL_GIFTS.filter((g) => {
    if (g.cost < CREDIT_LIMITS.giftMin || g.cost > CREDIT_LIMITS.giftMax) return false;
    const matchCat = activeCategory === "all" || g.category === activeCategory;
    const matchSearch = !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSelectGift = (gift: GiftItem) => {
    triggerHaptic(10);
    setSelectedGift((prev) => (prev?.id === gift.id ? null : gift));
  };

  const handleConfirmSend = async () => {
    if (!selectedGift || !targetUserForGift || isSyncing) return;
    if (userBalance < selectedGift.cost) {
      toast({
        variant: "destructive",
        title: "Insufficient Credits",
        description: `You need ${selectedGift.cost} Credits, but your balance is ${userBalance.toFixed(2)} Credits.`,
      });
      return;
    }

    setIsSyncing(true);
    triggerHaptic(30);
    try {
      await processGiftTransaction(selectedGift.cost, {
        itemId: selectedGift.id,
        itemName: selectedGift.name,
      });
      setIsSuccess(true);
      triggerHaptic(100);
      setTimeout(() => {
        setIsSuccess(false);
        setSelectedGift(null);
        closeGiftHub();
      }, 2200);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gift Failed", description: e.message });
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isGiftHubOpen) return null;

  const canAfford = Boolean(selectedGift && userBalance >= selectedGift.cost);

  return (
    <Sheet open={isGiftHubOpen} onOpenChange={(open) => !open && closeGiftHub()}>
      <SheetContent
        side="bottom"
        className="p-0 border-0 bg-transparent h-[92vh] flex flex-col overflow-hidden rounded-t-[2rem]"
      >
        {/* Background */}
        <div className="absolute inset-0 bg-[#080C14] rounded-t-[2rem]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.12),_transparent_60%)] rounded-t-[2rem]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(168,85,247,0.08),_transparent_60%)] rounded-t-[2rem]" />

        {/* Drag handle */}
        <div className="relative z-10 flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {isSuccess ? (
          /* ── Success Screen ── */
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 animate-in zoom-in-95 duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-400/30 blur-3xl rounded-full scale-150" />
              <div className="relative h-28 w-28 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-cyan-500/40">
                <CheckCircle2 className="h-14 w-14 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <div className="text-center space-y-2 px-8">
              <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">
                Gift Sent!
              </h3>
              <p className="text-sm font-bold text-white/50 uppercase tracking-widest">
                {selectedGift?.emoji} {selectedGift?.name} → @{targetUserForGift?.username}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl px-5 py-3">
              <Gem className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-black text-cyan-400">
                {selectedGift?.cost} Credits · 80% to creator · 20% fee
              </span>
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* ── Header ── */}
            <div className="shrink-0 px-5 pt-2 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">Send a Gift</h2>
                  <p className="text-[10px] font-bold text-cyan-400/70 uppercase tracking-widest mt-0.5">
                    to @{targetUserForGift?.username} · {CREDIT_LIMITS.giftMin}–{CREDIT_LIMITS.giftMax} Credits
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Credit balance */}
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2">
                    <div className="h-5 w-5 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                      <Gem className="h-3 w-3 text-cyan-400" />
                    </div>
                    <span className="text-sm font-black text-white tabular-nums">
                      {userBalance % 1 === 0 ? userBalance.toFixed(0) : userBalance.toFixed(2)}
                    </span>
                    <span className="text-[9px] font-bold text-cyan-400 uppercase">Credits</span>
                  </div>
                  <button
                    onClick={closeGiftHub}
                    className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
                <input
                  type="text"
                  placeholder="Search gifts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 text-sm text-white placeholder:text-white/25 font-medium focus:outline-none focus:border-cyan-500/40 focus:bg-white/8 transition-all"
                />
              </div>

              {/* Category pills */}
              <div
                ref={categoryScrollRef}
                className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
                style={{ scrollbarWidth: "none" }}
              >
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { triggerHaptic(5); setActiveCategory(cat.id); setSearchQuery(""); }}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200",
                      activeCategory === cat.id
                        ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                        : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/80"
                    )}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Gift Grid ── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-36">
              {filteredGifts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <span className="text-3xl">🔍</span>
                  <p className="text-white/30 text-sm font-bold uppercase tracking-widest">No gifts found</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                  {filteredGifts.map((gift) => {
                    const isSelected = selectedGift?.id === gift.id;
                    const affordable = userBalance >= gift.cost;
                    return (
                      <button
                        key={gift.id}
                        onClick={() => handleSelectGift(gift)}
                        className={cn(
                          "group relative flex flex-col items-center gap-1.5 p-2.5 rounded-2xl transition-all duration-200 active:scale-95",
                          isSelected
                            ? "bg-cyan-500/15 ring-2 ring-cyan-400/60 scale-[1.04]"
                            : affordable
                            ? "bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06]"
                            : "bg-white/[0.02] border border-white/[0.04] opacity-50"
                        )}
                      >
                        {isSelected && (
                          <div className="absolute inset-0 bg-cyan-400/5 rounded-2xl" />
                        )}
                        {/* Emoji */}
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center text-2xl transition-all duration-200 relative z-10",
                          isSelected ? "bg-cyan-500/20 scale-110" : "bg-white/5"
                        )}>
                          {gift.emoji}
                        </div>
                        {/* Name */}
                        <p className="text-[7.5px] font-black uppercase tracking-wide text-white/50 text-center leading-tight line-clamp-1 w-full relative z-10">
                          {gift.name}
                        </p>
                        {/* Price */}
                        <div className="flex items-center gap-1 relative z-10">
                          <Gem className={cn("h-2.5 w-2.5", isSelected ? "text-cyan-400" : "text-cyan-500/60")} />
                          <span className={cn(
                            "text-[10px] font-black tabular-nums",
                            isSelected ? "text-cyan-300" : "text-white/70"
                          )}>
                            {gift.cost}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 h-3.5 w-3.5 bg-cyan-400 rounded-full flex items-center justify-center z-10">
                            <CheckCircle2 className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Bottom Action Bar ── */}
            <div className="absolute bottom-0 left-0 right-0 z-50">
              <div className="bg-gradient-to-t from-[#080C14] via-[#080C14]/95 to-transparent pt-8 pb-6 px-4">
                {selectedGift ? (
                  <div className="flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
                    {/* Gift preview */}
                    <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 h-16 flex items-center gap-3">
                      <span className="text-2xl">{selectedGift.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Sending</p>
                        <p className="text-sm font-black text-white truncate">{selectedGift.name}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        <Gem className="h-4 w-4 text-cyan-400" />
                        <span className="text-lg font-black text-cyan-300 tabular-nums">
                          {selectedGift.cost}
                        </span>
                        <span className="text-[9px] font-black text-cyan-400/70 uppercase">Credits</span>
                      </div>
                    </div>

                    {/* Send button */}
                    {canAfford ? (
                      <Button
                        onClick={handleConfirmSend}
                        disabled={isSyncing}
                        className="h-16 px-8 rounded-2xl font-black italic uppercase tracking-widest text-sm shadow-2xl transition-all active:scale-95 shrink-0 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-cyan-500/30 hover:from-cyan-400 hover:to-cyan-500"
                      >
                        {isSyncing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send"}
                      </Button>
                    ) : (
                      <Link href="/currency" onClick={closeGiftHub}>
                        <Button className="h-16 px-6 rounded-2xl font-black italic uppercase tracking-widest text-xs shadow-2xl transition-all active:scale-95 shrink-0 bg-amber-500 hover:bg-amber-400 text-black">
                          Top Up
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest">
                      Tap a gift to select it · 80% to creator, 20% fee
                    </p>
                    <Link href="/currency" onClick={closeGiftHub}>
                      <button className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-3 py-2">
                        <Gem className="h-3 w-3 text-cyan-400" />
                        <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Top Up</span>
                      </button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
