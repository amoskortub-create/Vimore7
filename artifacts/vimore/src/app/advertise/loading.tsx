export default function AdvertiseLoading() {
  return (
    <div className="min-h-screen bg-[#F0F2F5] dark:bg-background">
      <div className="h-[61px] bg-white/80 dark:bg-card/80 border-b border-border/30 flex items-center px-4 gap-3">
        <div className="h-8 w-8 rounded-full bg-muted/50 animate-pulse" />
        <div className="h-4 w-36 bg-muted/50 rounded-full animate-pulse" />
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="h-32 rounded-3xl bg-white/70 dark:bg-card/60 animate-pulse" />
        <div className="h-64 rounded-3xl bg-white/70 dark:bg-card/60 animate-pulse" />
      </div>
    </div>
  );
}
