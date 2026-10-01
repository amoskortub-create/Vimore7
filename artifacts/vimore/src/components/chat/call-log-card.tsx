import {
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Users,
  Video,
} from "lucide-react";

export type CallLogSummary = {
  event: "invitation" | "missed" | "declined" | "completed";
  mediaType: "audio" | "video";
  duration?: string;
};

export function parseCallLogText(text?: string): CallLogSummary | null {
  const value = text?.trim().replace(/\s+/g, " ");
  if (!value) return null;

  const invitation = value.match(/^(?:(audio|voice|video)\s+call\s+invitation|invitation\s+to\s+(?:join\s+)?(?:an?\s+)?(audio|voice|video)\s+call|(?:you(?:'ve| have| are| were)?\s+)?invited\s+to\s+(?:join\s+)?(?:an?\s+)?(audio|voice|video)\s+call|call\s+invitation)[.!?]?$/i);
  if (invitation) {
    const media = invitation[1] || invitation[2] || invitation[3] || "audio";
    return { event: "invitation", mediaType: media.toLowerCase() === "video" ? "video" : "audio" };
  }

  const ended = value.match(/^(missed|declined)\s+(audio|voice|video)\s+call$/i);
  if (ended) {
    return {
      event: ended[1].toLowerCase() as "missed" | "declined",
      mediaType: ended[2].toLowerCase() === "video" ? "video" : "audio",
    };
  }

  const completed = value.match(/^(audio|voice|video)\s+call(?:\s*[·•]\s*(\d+(?::\d{2}){1,2}))?$/i);
  if (completed) {
    return {
      event: "completed",
      mediaType: completed[1].toLowerCase() === "video" ? "video" : "audio",
      duration: completed[2],
    };
  }

  return null;
}

interface CallLogCardProps {
  id: string;
  call: CallLogSummary;
  isMe: boolean;
  isGroupCall?: boolean;
  time: string;
}

export function CallLogCard({ id, call, isMe, isGroupCall = false, time }: CallLogCardProps) {
  const styles = {
    invitation: {
      icon: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
      border: "border-sky-200 dark:border-sky-900/60",
      title: "text-sky-800 dark:text-sky-300",
      badge: "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
      label: "Invitation",
    },
    missed: {
      icon: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300",
      border: "border-rose-200 dark:border-rose-900/60",
      title: "text-rose-700 dark:text-rose-300",
      badge: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
      label: "Missed",
    },
    declined: {
      icon: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
      border: "border-amber-200 dark:border-amber-900/60",
      title: "text-amber-800 dark:text-amber-300",
      badge: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
      label: "Declined",
    },
    completed: {
      icon: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
      border: "border-violet-200 dark:border-violet-900/60",
      title: "text-foreground",
      badge: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
      label: "Connected",
    },
  }[call.event];

  const Icon = isGroupCall
    ? Users
    : call.event === "invitation"
      ? isMe
        ? PhoneOutgoing
        : PhoneIncoming
      : call.event === "missed"
      ? PhoneMissed
      : call.event === "declined"
        ? PhoneOff
        : call.mediaType === "video"
          ? Video
          : isMe
            ? PhoneOutgoing
            : PhoneIncoming;

  const mediaLabel = call.mediaType === "video" ? "Video" : "Audio";
  const title = isGroupCall
    ? call.event === "invitation"
      ? "Group call invitation"
      : call.event === "missed"
      ? "Missed group call"
      : call.event === "declined"
        ? "Declined group call"
        : "Group call"
    : call.event === "invitation"
      ? `${mediaLabel} call invitation`
      : call.event === "completed"
      ? `${mediaLabel} call`
      : `${styles.label} ${mediaLabel.toLowerCase()} call`;
  const detail = isGroupCall
    ? `${mediaLabel} · Group conversation`
    : call.event === "invitation"
      ? `${isMe ? "Outgoing" : "Incoming"} invitation`
    : `${isMe ? "Outgoing" : "Incoming"} ${mediaLabel.toLowerCase()} call`;

  return (
    <article
      aria-label={`${title}${call.duration ? `, duration ${call.duration}` : ""}`}
      data-testid={`call-log-card-${id}`}
      className={`flex w-[min(290px,78vw)] max-w-full items-center gap-3 rounded-2xl border ${styles.border} bg-white px-3.5 py-3 shadow-sm dark:bg-[#17121D]`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${styles.icon}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`truncate text-sm font-semibold ${styles.title}`} data-testid={`call-log-title-${id}`}>
              {title}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
          </div>
          {call.duration && (
            <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold tabular-nums text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              {call.duration}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${styles.badge}`}>
            {styles.label}
          </span>
          <time className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{time}</time>
        </div>
      </div>
    </article>
  );
}