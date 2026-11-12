"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { databases, DATABASE_ID, COL, Query, Models } from "@/lib/appwrite";
import { getPaymentScreenshotUrl, reviewCreatorPayment } from "@/lib/orange-money-payments";
import { usePosts } from "@/context/PostContext";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type PaymentKind = "lockedPost" | "gift";
type PaymentRecord = { kind: PaymentKind; document: Models.Document };

function withTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Payment list timed out after 5 seconds")), 5000);
    request.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export function OrangeMoneyPaymentsPanel() {
  const { currentUser, refreshSocialGraph } = usePosts();
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState("");

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    setError("");
    try {
      const [lockedAsBuyer, lockedAsCreator, giftsAsBuyer, giftsAsCreator] = await Promise.all([
        databases.listDocuments(DATABASE_ID, COL.LOCKED_POST_PAYMENTS, [Query.equal("buyerId", currentUser.$id), Query.orderDesc("$createdAt"), Query.limit(100)]),
        databases.listDocuments(DATABASE_ID, COL.LOCKED_POST_PAYMENTS, [Query.equal("creatorId", currentUser.$id), Query.orderDesc("$createdAt"), Query.limit(100)]),
        databases.listDocuments(DATABASE_ID, COL.GIFTS, [Query.equal("buyerId", currentUser.$id), Query.orderDesc("$createdAt"), Query.limit(100)]),
        databases.listDocuments(DATABASE_ID, COL.GIFTS, [Query.equal("creatorId", currentUser.$id), Query.orderDesc("$createdAt"), Query.limit(100)]),
      ].map(withTimeout));
      const byId = new Map<string, PaymentRecord>();
      for (const document of lockedAsBuyer.documents) byId.set(document.$id, { kind: "lockedPost", document });
      for (const document of lockedAsCreator.documents) byId.set(document.$id, { kind: "lockedPost", document });
      for (const document of giftsAsBuyer.documents) byId.set(document.$id, { kind: "gift", document });
      for (const document of giftsAsCreator.documents) byId.set(document.$id, { kind: "gift", document });
      setRecords([...byId.values()].sort((a, b) => String(b.document.createdAt || b.document.$createdAt).localeCompare(String(a.document.createdAt || a.document.$createdAt))));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const confirmedEarnings = useMemo(() => records
    .filter(({ document }) => document.creatorId === currentUser?.$id && document.status === "confirmed")
    .reduce((sum, { document }) => sum + Number(document.amountLRD || 0), 0), [records, currentUser?.$id]);
  const confirmedGifts = useMemo(() => records
    .filter(({ kind, document }) => kind === "gift" && document.creatorId === currentUser?.$id && document.status === "confirmed"), [records, currentUser?.$id]);
  const confirmedGiftTotal = useMemo(() => confirmedGifts
    .reduce((sum, { document }) => sum + Number(document.amountLRD || 0), 0), [confirmedGifts]);
  const confirmedLockedPostSales = useMemo(() => records
    .filter(({ kind, document }) => kind === "lockedPost" && document.creatorId === currentUser?.$id && document.status === "confirmed")
    .reduce((sum, { document }) => sum + Number(document.amountLRD || 0), 0), [records, currentUser?.$id]);

  const handleReview = async (record: PaymentRecord, status: "confirmed" | "rejected") => {
    if (!currentUser) return;
    setReviewingId(record.document.$id);
    setError("");
    try {
      await reviewCreatorPayment(record.kind, record.document, currentUser.$id, status);
      setRecords(previous => previous.map(item => item.document.$id === record.document.$id
        ? { ...item, document: { ...item.document, status } }
        : item));
      if (status === "confirmed" && record.kind === "lockedPost") await refreshSocialGraph();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : String(reviewError));
    } finally {
      setReviewingId("");
    }
  };

  if (!currentUser) return null;

  return (
    <section className="rounded-[2rem] border border-orange-500/15 bg-white p-5 shadow-sm dark:bg-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Orange Money Payments</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Direct creator-to-buyer transfers · Confirmed earnings: {confirmedEarnings.toLocaleString()} LRD
            {" · Gifts: "}{confirmedGifts.length} ({confirmedGiftTotal.toLocaleString()} LRD)
            {" · Locked-post sales: "}{confirmedLockedPostSales.toLocaleString()} LRD
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>Refresh</Button>
      </div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading payment history…</div>
      ) : records.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No Orange Money payment records yet.</p>
      ) : (
        <div className="space-y-3">
          {records.map(({ kind, document }) => {
            const isCreator = document.creatorId === currentUser.$id;
            const screenshotUrl = getPaymentScreenshotUrl(String(document.screenshotFileId || ""));
            const status = String(document.status || "pending");
            return (
              <article key={`${kind}-${document.$id}`} className={`rounded-2xl border border-border p-4 ${kind === "gift" && status === "confirmed" ? "animate-in zoom-in-95 duration-500" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      {kind === "gift" ? `Gift: ${document.giftType || "Gift"}` : "Locked post unlock"}
                      {document.postId ? ` · Post ${String(document.postId).slice(0, 8)}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isCreator ? `From ${document.buyerName || "Buyer"}` : "To creator"} · {Number(document.amountLRD || 0).toLocaleString()} LRD · Txn {document.transactionId}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Sender: {document.senderNumber}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${status === "confirmed" ? "bg-green-500/10 text-green-600" : status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>
                    {status}
                  </span>
                </div>
                {screenshotUrl && <a className="mt-2 inline-block text-xs font-bold text-primary underline" href={screenshotUrl} target="_blank" rel="noreferrer">View payment screenshot</a>}
                {isCreator && status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" disabled={reviewingId === document.$id} onClick={() => void handleReview({ kind, document }, "confirmed")}>
                      Confirm Payment Received
                    </Button>
                    <Button size="sm" variant="destructive" disabled={reviewingId === document.$id} onClick={() => void handleReview({ kind, document }, "rejected")}>
                      Reject — No Payment Found
                    </Button>
                  </div>
                )}
                {!isCreator && status === "rejected" && <p className="mt-2 text-xs text-destructive">Payment not confirmed by creator. Check Transaction ID and try again.</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
