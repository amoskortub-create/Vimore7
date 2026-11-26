"use client";

import { useState } from "react";
import { Gem, Rocket, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { usePosts } from "@/context/PostContext";
import { useToast } from "@/hooks/use-toast";
import {
  MARKETPLACE_BOOST_CREDITS_PER_DAY,
  MARKETPLACE_BOOST_MIN_DAYS,
  MARKETPLACE_BOOST_MAX_DAYS,
  isFeatured,
  ProductDoc,
} from "@/lib/marketplace";

interface Props {
  product: ProductDoc;
  children: React.ReactNode;
  onBoosted?: (newUntil: string) => void;
}

export function BoostDialog({ product, children, onBoosted }: Props) {
  const { currentUser, boostMarketplaceListing } = usePosts();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(MARKETPLACE_BOOST_MIN_DAYS);
  const [submitting, setSubmitting] = useState(false);

  const totalCost = days * MARKETPLACE_BOOST_CREDITS_PER_DAY;
  const balance = currentUser?.creditBalance ?? currentUser?.diamondBalance ?? 0;
  const insufficient = balance < totalCost;
  const alreadyFeatured = isFeatured(product);

  const adjust = (delta: number) => {
    setDays(d => Math.min(MARKETPLACE_BOOST_MAX_DAYS, Math.max(MARKETPLACE_BOOST_MIN_DAYS, d + delta)));
  };

  const handleConfirm = async () => {
    if (insufficient) {
      toast({ variant: "destructive", title: "Not enough Credits", description: `You need ${totalCost.toLocaleString()} Credits but have ${balance.toLocaleString()}.` });
      return;
    }
    setSubmitting(true);
    try {
      const newUntil = await boostMarketplaceListing(product.$id, days);
      onBoosted?.(newUntil);
      setOpen(false);
    } catch { /* toast already shown */ }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="rounded-3xl max-w-md">
        <DialogHeader>
          <div className="h-14 w-14 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mx-auto mb-2">
            <Rocket className="h-7 w-7" />
          </div>
          <DialogTitle className="font-black italic uppercase tracking-tighter text-center text-xl">Feature this listing</DialogTitle>
          <DialogDescription className="text-center text-xs">
            Push your product to the top of the marketplace. <span className="font-bold text-foreground">{MARKETPLACE_BOOST_CREDITS_PER_DAY} Credits / day</span>.
          </DialogDescription>
        </DialogHeader>

        {alreadyFeatured && product.featuredUntil && (
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-3 py-2 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500">Currently Featured</p>
            <p className="text-xs text-muted-foreground">Active until {new Date(product.featuredUntil).toLocaleDateString()}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Adding more time stacks on top.</p>
          </div>
        )}

        <div className="bg-secondary/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Boost Days</p>
            <p className="text-[10px] text-muted-foreground">Balance: <span className="font-bold text-cyan-500">{balance.toLocaleString()} Credits</span></p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => adjust(-1)} disabled={days <= MARKETPLACE_BOOST_MIN_DAYS} className="h-12 w-12 rounded-full bg-background">
              <Minus className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 bg-cyan-500/10 px-6 py-3 rounded-2xl min-w-[140px] justify-center">
              <span className="text-3xl font-black tabular-nums">{days}</span>
              <span className="text-xs font-black uppercase text-cyan-600 dark:text-cyan-400">{days === 1 ? 'day' : 'days'}</span>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => adjust(1)} disabled={days >= MARKETPLACE_BOOST_MAX_DAYS} className="h-12 w-12 rounded-full bg-background">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-center pt-1">
            <p className="text-2xl font-black italic uppercase tracking-tighter text-primary flex items-center justify-center gap-1.5">
              <Gem className="h-5 w-5 text-cyan-500" />
              {totalCost.toLocaleString()} Credits
            </p>
            <p className="text-[10px] text-muted-foreground">{MARKETPLACE_BOOST_CREDITS_PER_DAY} Credits/day · Featured at the top of the marketplace</p>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting} className="rounded-xl">Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || insufficient}
            className="rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white gap-2 font-black uppercase tracking-widest text-[10px]"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {insufficient ? "Not enough Credits" : `Boost · ${totalCost.toLocaleString()} Credits`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
