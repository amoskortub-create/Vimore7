"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCall } from "@/context/CallContext";
import { usePosts } from "@/context/PostContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  Camera,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Plus,
  Search,
  Send,
  VideoOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CallPeer = { $id: string; name: string; username?: string; avatar?: string };

const QUICK_REPLIES = [
  "I’ll call you back shortly.",
  "Can I call you in a few minutes?",
  "I’m not available right now.",
];

function initials(name?: string) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function AvatarBlock({ peer, size = "large" }: { peer?: CallPeer | null; size?: "small" | "large" }) {
  return (
    <Avatar className={cn(
      "shrink-0 border border-white/15 bg-white/10 text-white",
      size === "large" ? "h-28 w-28 sm:h-36 sm:w-36 ring-8 ring-white/[0.04]" : "h-10 w-10",
    )}>
      {peer?.avatar && <AvatarImage src={peer.avatar} alt={peer.name} />}
      <AvatarFallback className="bg-[#6a50a5] text-white font-semibold">{initials(peer?.name)}</AvatarFallback>
    </Avatar>
  );
}

function LiveCallControls({
  type,
  peer,
  title,
  startedAt,
  cameraError,
  onCameraError,
  onEnd,
  onInvite,
}: {
  type: "audio" | "video";
  peer: CallPeer;
  title: string;
  startedAt?: string;
  cameraError: string | null;
  onCameraError: (message: string | null) => void;
  onEnd: () => void;
  onInvite: () => void;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const participants = useParticipants();
  const [elapsed, setElapsed] = useState(0);
  const startedAtMs = useRef(startedAt ? Date.parse(startedAt) || Date.now() : Date.now());
  const toggleCamera = useCallback(async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
      onCameraError(null);
    } catch {
      onCameraError("ViMore could not access your camera. Allow camera access in your browser settings, then retry.");
    }
  }, [isCameraEnabled, localParticipant, onCameraError]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtMs.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const remoteTracks = tracks.filter((track) => track.participant.identity !== localParticipant.identity);
  const localTrack = tracks.find((track) => track.participant.identity === localParticipant.identity);

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#171322] text-white">
      {type === "video" && remoteTracks.length > 0 ? (
        <div className={cn(
          "absolute inset-0 grid gap-1 p-1",
          remoteTracks.length > 1 ? "grid-cols-2 auto-rows-fr" : "grid-cols-1",
        )}>
          {remoteTracks.map((trackRef) => (
            <div key={trackRef.publication?.trackSid || trackRef.participant.identity} className="relative min-h-0 overflow-hidden rounded-xl bg-black/50">
              <VideoTrack trackRef={trackRef} className="h-full w-full object-cover" />
              <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs text-white">
                {trackRef.participant.name || trackRef.participant.identity}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_34%,#55416f_0%,#292138_39%,#171322_76%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-[#100d17]/90" />
      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <div>
          <p className="text-xs font-medium tracking-wide text-white/60">{type === "video" ? "Video call" : "Audio call"}{title !== peer.name ? ` · ${title}` : ""}</p>
          <p className="mt-1 text-sm font-semibold">{clock} <span className="ml-1 text-emerald-300">{participants.length > 1 ? "Connected" : "Waiting for others"}</span></p>
        </div>
      </header>

      {type === "video" && cameraError && (
        <div role="alert" className="relative z-20 mx-4 mt-4 flex items-center justify-between gap-4 rounded-2xl border border-amber-200/30 bg-amber-950/80 px-4 py-3 text-sm text-amber-50">
          <span>{cameraError}</span>
          <button type="button" onClick={() => void toggleCamera()} className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25">
            Retry camera
          </button>
        </div>
      )}

      <main className="relative z-[1] flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
        {type === "audio" || remoteTracks.length === 0 ? (
          <>
            <div className="relative mb-7">
              <AvatarBlock peer={peer} />
              <span className="absolute bottom-2 right-2 h-4 w-4 rounded-full border-[3px] border-[#292138] bg-emerald-400" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{peer.name}</h1>
            <p className="mt-2 text-sm text-white/60">
              {type === "video"
                ? participants.length > 1 ? "Connected. Waiting for their camera." : "Waiting for the other person to join…"
                : "You’re together, just talking."}
            </p>
          </>
        ) : null}
        {type === "video" && localTrack && (
          <div className="absolute bottom-5 right-5 z-10 h-32 w-24 overflow-hidden rounded-2xl border border-white/20 bg-black/40 shadow-xl sm:bottom-8 sm:right-8 sm:h-44 sm:w-32">
            <VideoTrack trackRef={localTrack} className="h-full w-full object-cover" />
          </div>
        )}
      </main>

      <footer className="relative z-10 flex items-center justify-center gap-3 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-5">
        <ControlButton label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"} onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)} active={!isMicrophoneEnabled}>
          {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </ControlButton>
        {type === "video" && (
          <ControlButton label={isCameraEnabled ? "Turn camera off" : "Turn camera on"} onClick={() => void toggleCamera()} active={!isCameraEnabled}>
            {isCameraEnabled ? <Camera className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </ControlButton>
        )}
        <ControlButton label="Invite someone" onClick={onInvite}><Plus className="h-5 w-5" /></ControlButton>
        <button
          type="button"
          aria-label="End call"
          onClick={onEnd}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#eb554f] text-white shadow-lg transition-transform hover:scale-105 active:scale-95 sm:h-16 sm:w-16"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </footer>
    </div>
  );
}

function ControlButton({ children, label, onClick, active = false }: { children: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn("flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/20 sm:h-14 sm:w-14", active && "bg-white text-[#211a2c] hover:bg-white/90")}
    >
      {children}
    </button>
  );
}

export function CallExperience() {
  const calls = useCall();
  const { currentUser, connections = [], allUsers = [] } = usePosts();
  const { incomingCall, outgoingCall, activeCall, pendingConnection, groupCalls, isLoading, error } = calls;
  const [showInvite, setShowInvite] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [search, setSearch] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const groupIncomingCall = groupCalls.find((call) =>
    call.groupId &&
    call.callee_id === currentUser?.$id &&
    (call.status === "dialing" || call.status === "ringing"),
  ) || null;
  const ringingCall = incomingCall || groupIncomingCall;
  const shouldPlayRingtone = !activeCall && !pendingConnection && Boolean(ringingCall || outgoingCall);
  const ringingKey = shouldPlayRingtone ? `${ringingCall?.$id || ""}:${outgoingCall?.$id || ""}` : "";

  useEffect(() => {
    setCameraError(null);
  }, [activeCall?.call.$id]);

  useEffect(() => {
    if (!ringingKey) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }
    const audio = new Audio("/sounds/ringtone.wav");
    audio.loop = true;
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      audio.currentTime = 0;
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [ringingKey]);

  const peers = useMemo(() => {
    const unique = new Map<string, CallPeer>();
    [...connections, ...allUsers].forEach((person) => {
      if (person.$id !== currentUser?.$id) unique.set(person.$id, {
        $id: person.$id, name: person.name, username: person.username, avatar: person.avatar,
      });
    });
    return [...unique.values()].filter((person) =>
      `${person.name} ${person.username || ""}`.toLowerCase().includes(search.toLowerCase()),
    );
  }, [connections, allUsers, currentUser?.$id, search]);

  const closeInvite = useCallback(() => {
    setShowInvite(false);
    setSearch("");
  }, []);

  const endActiveCall = useCallback(() => {
    void calls.endCall();
  }, [calls]);

  const invite = useCallback((peer: CallPeer) => {
    void calls.inviteParticipant(peer);
  }, [calls]);

  const sendReply = useCallback((text: string) => {
    void calls.sendQuickReply(text);
    setShowQuickReplies(false);
  }, [calls]);

  if (activeCall) {
    return (
      <>
        <div className="fixed inset-0 z-[120]">
          <LiveKitRoom
            serverUrl={activeCall.serverUrl}
            token={activeCall.token}
            connect
            audio
            video={activeCall.call.type === "video"}
            onDisconnected={() => undefined}
            onMediaDeviceFailure={(_failure, kind) => {
              if (activeCall.call.type === "video" && (!kind || kind === "videoinput")) {
                setCameraError("ViMore can’t access your camera. Allow Camera for this site in your browser and device settings, close other apps using it, then tap Retry camera.");
              }
            }}
            className="h-full w-full"
          >
            <RoomAudioRenderer />
            <LiveCallControls
              type={activeCall.call.type}
              peer={activeCall.peer}
              title={activeCall.call.groupName || activeCall.peer.name}
              startedAt={activeCall.call.started_at}
              cameraError={cameraError}
              onCameraError={setCameraError}
              onEnd={endActiveCall}
              onInvite={() => setShowInvite(true)}
            />
          </LiveKitRoom>
        </div>
        {showInvite && <InviteSheet peers={peers} busy={isLoading} error={error ?? undefined} onClose={closeInvite} onInvite={invite} />}
      </>
    );
  }

  if (pendingConnection) {
    return (
      <div className="fixed inset-0 z-[120] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#171322] p-4 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_34%,#55416f_0%,#292138_39%,#171322_76%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[#100d17]/90" />
        <section className="relative z-10 w-full max-w-sm px-6 py-10 text-center">
          <div className="mx-auto mb-7 w-fit animate-pulse"><AvatarBlock peer={pendingConnection.peer} /></div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
            {pendingConnection.groupId ? "Group call" : `${pendingConnection.type} call`}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{pendingConnection.peer.name}</h2>
          <p role={error ? "alert" : undefined} className={cn("mt-3 text-sm", error ? "text-rose-300" : "text-white/65")}>
            {isLoading
              ? "Connecting to the call…"
              : error || "Waiting for the call connection. You can retry without ending the call."}
          </p>
          {!error && isLoading && (
            <p className="mt-2 text-sm text-white/45">The call screen will open as soon as the connection is ready.</p>
          )}
          <div className="mt-9 grid grid-cols-2 gap-3">
            <Button className="h-12 rounded-full" disabled={isLoading} onClick={() => void calls.retryConnection()}>
              {isLoading ? "Connecting…" : "Try again"}
            </Button>
            <Button variant="destructive" className="h-12 rounded-full" disabled={isLoading} onClick={() => void calls.endCall()}>
              <PhoneOff className="mr-2 h-4 w-4" /> End call
            </Button>
          </div>
        </section>
      </div>
    );
  }

  if (ringingCall) {
    const peer = ringingCall.peer;
    return (
      <>
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#171322]/80 p-4 backdrop-blur-md">
          <section className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-[#211a2c] px-7 pb-7 pt-10 text-center text-white shadow-2xl sm:px-10">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#9d7be5] via-[#e6c1ff] to-[#9d7be5]" />
            <span className="mx-auto mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[#dfc8ff]"><PhoneIncoming className="h-5 w-5" /></span>
            <div className="mx-auto mb-5 w-fit animate-pulse"><AvatarBlock peer={peer} /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Incoming {ringingCall.type} call{ringingCall.groupId ? " · Group" : ""}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{peer?.name || "ViMore caller"}</h2>
            <p className="mt-2 text-sm text-white/55">
              {ringingCall.groupId ? "Join the conversation on ViMore" : peer?.username ? `@${peer.username}` : "Calling you on ViMore"}
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <Button className="h-12 rounded-full bg-[#ef5c59] text-white hover:bg-[#df4f4c]" onClick={() => void calls.rejectCall(ringingCall)}>
                <PhoneOff className="mr-2 h-4 w-4" /> Decline
              </Button>
              <Button className="h-12 rounded-full bg-emerald-500 text-white hover:bg-emerald-600" onClick={() => void (ringingCall.groupId ? calls.joinGroupCall(ringingCall) : calls.acceptCall(ringingCall))}>
                <Phone className="mr-2 h-4 w-4" /> Answer
              </Button>
            </div>
            {!ringingCall.groupId && (
              <button type="button" onClick={() => setShowQuickReplies(true)} className="mt-5 text-sm font-medium text-white/70 underline decoration-white/25 underline-offset-4 hover:text-white">
                Reply instead
              </button>
            )}
            {error && <p role="alert" className="mt-4 text-xs text-rose-300">{error}</p>}
          </section>
        </div>
        {showQuickReplies && <QuickReplySheet onClose={() => setShowQuickReplies(false)} onSend={sendReply} />}
      </>
    );
  }

  if (outgoingCall) {
    const peer = outgoingCall.peer;
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#171322]/80 p-4 backdrop-blur-md">
        <section className="w-full max-w-sm rounded-[2rem] border border-white/15 bg-[#211a2c] px-8 py-10 text-center text-white shadow-2xl">
          <div className="mx-auto mb-6 w-fit animate-pulse"><AvatarBlock peer={peer} /></div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{outgoingCall.type} call</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{peer?.name || "Calling"}</h2>
          <p className="mt-3 text-sm text-white/60">Waiting for them to pick up…</p>
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-white/40"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c5a3f8]" /> Calling on ViMore</div>
          <Button variant="ghost" className="mt-7 h-12 rounded-full bg-white/10 px-7 text-white hover:bg-white/20 hover:text-white" onClick={() => calls.cancelCall(outgoingCall)}>
            <PhoneOff className="mr-2 h-4 w-4" /> Cancel call
          </Button>
          {error && <p role="alert" className="mt-4 text-xs text-rose-300">{error}</p>}
        </section>
      </div>
    );
  }

  return null;
}

function InviteSheet({ peers, busy, error, onClose, onInvite }: { peers: CallPeer[]; busy: boolean; error?: string; onClose: () => void; onInvite: (peer: CallPeer) => void }) {
  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Invite someone to the call" className="max-h-[82dvh] w-full max-w-md overflow-hidden rounded-t-[1.75rem] bg-background shadow-2xl sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div><p className="font-semibold">Bring someone in</p><p className="text-xs text-muted-foreground">Invite a connection to this call</p></div>
          <Button variant="ghost" size="icon" aria-label="Close invite picker" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus placeholder="Search people" className="pl-9" onChange={(event) => (window.dispatchEvent(new CustomEvent("vimore-call-search", { detail: event.target.value })))} /></div>
          <InviteList peers={peers} busy={busy} error={error} onInvite={onInvite} />
        </div>
      </section>
    </div>
  );
}

function InviteList({ peers, busy, error, onInvite }: { peers: CallPeer[]; busy: boolean; error?: string; onInvite: (peer: CallPeer) => void }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const listener = (event: Event) => setQuery((event as CustomEvent<string>).detail || "");
    window.addEventListener("vimore-call-search", listener);
    return () => window.removeEventListener("vimore-call-search", listener);
  }, []);
  const filtered = peers.filter((peer) => `${peer.name} ${peer.username || ""}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="mt-3 max-h-[52dvh] overflow-y-auto">
      {busy && peers.length === 0 ? (
        <div className="space-y-3 p-2" aria-label="Loading people">{[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : filtered.length ? filtered.map((peer) => (
        <div key={peer.$id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60">
          <Avatar className="h-10 w-10"><AvatarImage src={peer.avatar} /><AvatarFallback>{initials(peer.name)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{peer.name}</p><p className="truncate text-xs text-muted-foreground">{peer.username ? `@${peer.username}` : "ViMore connection"}</p></div>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onInvite(peer)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Invite</Button>
        </div>
      )) : (
        <div className="px-4 py-10 text-center"><p className="text-sm font-medium">No one found</p><p className="mt-1 text-xs text-muted-foreground">Try another name or username.</p></div>
      )}
      {error && <p role="alert" className="px-2 pt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function QuickReplySheet({ onClose, onSend }: { onClose: () => void; onSend: (text: string) => void }) {
  const [custom, setCustom] = useState("");
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Send a quick reply" className="w-full max-w-md rounded-t-[1.75rem] bg-background p-5 shadow-2xl sm:rounded-[1.75rem]">
        <div className="mb-4 flex items-center justify-between"><div><p className="font-semibold">Reply without answering</p><p className="text-xs text-muted-foreground">They’ll get your message in the conversation.</p></div><Button variant="ghost" size="icon" aria-label="Close quick replies" onClick={onClose}><X className="h-4 w-4" /></Button></div>
        <div className="space-y-2">{QUICK_REPLIES.map((reply) => <button key={reply} type="button" className="w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors hover:bg-muted" onClick={() => onSend(reply)}>{reply}</button>)}</div>
        <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (custom.trim()) onSend(custom.trim()); }}>
          <Input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Write a reply…" maxLength={180} />
          <Button aria-label="Send reply" type="submit" disabled={!custom.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      </section>
    </div>
  );
}