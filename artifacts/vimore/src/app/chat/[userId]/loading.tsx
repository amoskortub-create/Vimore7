export default function ChatLoading() {
  return (
    <div className="min-h-screen bg-[#F0F2F5] dark:bg-background flex flex-col">
      <div className="h-[61px] bg-white/80 dark:bg-card/80 border-b border-border/30 flex items-center px-4 gap-3">
        <div className="h-9 w-9 rounded-full bg-muted/50 animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 bg-muted/50 rounded-full animate-pulse" />
          <div className="h-2.5 w-20 bg-muted/40 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="flex-1 max-w-3xl w-full mx-auto p-4 space-y-3">
        <div className="h-12 w-2/3 rounded-2xl bg-white/70 dark:bg-card/60 animate-pulse" />
        <div className="h-12 w-1/2 ml-auto rounded-2xl bg-primary/20 animate-pulse" />
        <div className="h-12 w-3/5 rounded-2xl bg-white/70 dark:bg-card/60 animate-pulse" />
      </div>
    </div>
  );
}
