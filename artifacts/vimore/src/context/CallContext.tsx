"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Query } from "appwrite";
import { client, COL, DATABASE_ID, databases } from "@/lib/appwrite";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import { usePosts, type User } from "@/context/PostContext";
import { firePush } from "@/lib/push-fire";

export type CallStatus = "dialing" | "ringing" | "accepted" | "rejected" | "missed" | "ended" | "busy";
export type CallType = "audio" | "video";

export interface CallPeer {
  $id: string;
  name: string;
  username?: string;
  avatar?: string;
}

export interface CallDocument {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
  caller_id: string;
  callee_id: string;
  status: CallStatus;
  type: CallType;
  started_at?: string;
  ended_at?: string;
  duration?: number;
  channel_id: string;
}

export interface CallRecord extends CallDocument {
  peer: CallPeer;
  groupId?: string;
  groupName?: string;
}

export interface ActiveCall {
  call: CallRecord;
  peer: CallPeer;
  token: string;
  serverUrl: string;
}

interface CallContextValue {
  incomingCall: CallRecord | null;
  outgoingCall: CallRecord | null;
  activeCall: ActiveCall | null;
  pendingConnection: CallRecord | null;
  groupCalls: CallRecord[];
  isLoading: boolean;
  error: string | null;
  startCall: (peer: CallPeer, type: CallType) => Promise<void>;
  startGroupCall: (groupId: string, groupName: string, participants: CallPeer[], type: CallType) => Promise<void>;
  acceptCall: (call: CallRecord) => Promise<void>;
  rejectCall: (call: CallRecord) => Promise<void>;
  cancelCall: (call: CallRecord) => Promise<void>;
  endCall: () => Promise<void>;
  retryConnection: () => Promise<void>;
  joinGroupCall: (call: CallRecord) => Promise<void>;
  inviteParticipant: (peer: CallPeer) => Promise<void>;
  sendQuickReply: (text: string) => Promise<void>;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

function parseCallDocument(value: unknown): CallDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Record<string, unknown>;
  if (
    typeof doc.$id !== "string" ||
    typeof doc.caller_id !== "string" ||
    typeof doc.callee_id !== "string" ||
    typeof doc.channel_id !== "string" ||
    typeof doc.status !== "string" ||
    typeof doc.type !== "string"
  ) return null;
  if (!["dialing", "ringing", "accepted", "rejected", "missed", "ended", "busy"].includes(doc.status)) return null;
  if (doc.type !== "audio" && doc.type !== "video") return null;
  return doc as unknown as CallDocument;
}

async function responseBody(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : "The call request failed.";
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}

function isTransientConnectionError(error: unknown) {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number }).status;
  return status === 408 || status === 429 || (typeof status === "number" && status >= 500);
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { currentUser, connections = [], allUsers = [], clusters = [], sendChatMessage } = usePosts();
  const { toast } = useToast();
  const [callDocuments, setCallDocuments] = useState<Record<string, CallDocument>>({});
  const callDocumentsRef = useRef(new Map<string, CallDocument>());
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [pendingConnection, setPendingConnection] = useState<CallRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joiningCallIds = useRef(new Set<string>());

  const upsertDocument = useCallback((value: unknown) => {
    const call = parseCallDocument(value);
    if (!call) return;
    const existing = callDocumentsRef.current.get(call.$id);
    const existingUpdated = existing?.$updatedAt ? Date.parse(existing.$updatedAt) : 0;
    const incomingUpdated = call.$updatedAt ? Date.parse(call.$updatedAt) : 0;
    if (existing && Number.isFinite(existingUpdated) && existingUpdated >= incomingUpdated) return;
    callDocumentsRef.current.set(call.$id, call);
    setCallDocuments((current) => ({ ...current, [call.$id]: call }));
  }, []);

  const resolvePeer = useCallback((userId: string): CallPeer => {
    const known: User | undefined = [...connections, ...allUsers].find((person) => person.$id === userId);
    if (known) {
      return {
        $id: known.$id,
        name: known.name || known.username || "ViMore user",
        username: known.username || undefined,
        avatar: known.avatar || undefined,
      };
    }
    return { $id: userId, name: "ViMore user" };
  }, [connections, allUsers]);

  const toCallRecord = useCallback((doc: CallDocument): CallRecord => {
    const groupId = doc.channel_id.startsWith("group_call_")
      ? doc.channel_id.slice("group_call_".length)
      : undefined;
    const cluster = groupId ? clusters.find((item) => item.$id === groupId) : undefined;
    const peerId = doc.caller_id === currentUser?.$id ? doc.callee_id : doc.caller_id;
    return {
      ...doc,
      peer: groupId
        ? { $id: groupId, name: cluster?.name || "Group call" }
        : resolvePeer(peerId),
      groupId,
      groupName: cluster?.name || undefined,
    };
  }, [clusters, currentUser?.$id, resolvePeer]);

  const callEntries = useMemo(
    () => Object.values(callDocuments).map(toCallRecord),
    [callDocuments, toCallRecord],
  );
  const hasActiveCalls = callEntries.some((call) =>
    ["dialing", "ringing", "accepted"].includes(call.status),
  );

  const incomingCall = useMemo(() => {
    if (!currentUser) return null;
    return callEntries
      .filter((call) =>
        call.callee_id === currentUser.$id &&
        !call.groupId &&
        (call.status === "dialing" || call.status === "ringing"),
      )
      .sort((a, b) => (Date.parse(b.$createdAt || "") || 0) - (Date.parse(a.$createdAt || "") || 0))[0] || null;
  }, [callEntries, currentUser]);

  const outgoingCall = useMemo(() => {
    if (!currentUser) return null;
    return callEntries
      .filter((call) =>
        call.caller_id === currentUser.$id &&
        !call.groupId &&
        (call.status === "dialing" || call.status === "ringing"),
      )
      .sort((a, b) => (Date.parse(b.$createdAt || "") || 0) - (Date.parse(a.$createdAt || "") || 0))[0] || null;
  }, [callEntries, currentUser]);

  const groupCalls = useMemo(() => {
    const byRoom = new Map<string, CallRecord>();
    for (const call of callEntries) {
      if (!call.groupId || !["accepted", "ringing", "dialing"].includes(call.status)) continue;
      const current = byRoom.get(call.channel_id);
      if (!current || (Date.parse(call.$createdAt || "") || 0) > (Date.parse(current.$createdAt || "") || 0)) {
        byRoom.set(call.channel_id, call);
      }
    }
    return [...byRoom.values()];
  }, [callEntries]);

  const apiRequest = useCallback(async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    const response = await authFetch("/api/calls", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return responseBody(response);
  }, []);

  useEffect(() => {
    const callerId = currentUser?.$id;
    if (!callerId) return;

    const timeoutTargets = new Map<string, CallRecord>();
    callEntries
      .filter((call) =>
        call.caller_id === callerId &&
        (call.status === "dialing" || call.status === "ringing"),
      )
      .forEach((call) => {
        const key = call.groupId ? `group:${call.channel_id}` : `direct:${call.$id}`;
        if (!timeoutTargets.has(key)) timeoutTargets.set(key, call);
      });

    const timers = [...timeoutTargets.values()].map((call) => {
        const createdAt = Date.parse(call.$createdAt || "");
        const elapsed = Number.isFinite(createdAt) ? Date.now() - createdAt : 0;
        const delay = Math.max(0, 45_000 - elapsed);
        return setTimeout(() => {
          void apiRequest("PATCH", { action: "missed", callDocId: call.$id })
            .then((result) => {
              const updated = Array.isArray(result.calls) ? result.calls : [result.call];
              updated.filter(Boolean).forEach(upsertDocument);
              const missedUserIds = updated
                .filter((item: CallDocument) => item?.status === "missed")
                .map((item: CallDocument) => item.callee_id)
                .filter((userId: string) => userId !== callerId);
              if (missedUserIds.length) {
                firePush({
                  userIds: missedUserIds,
                  sourceIds: updated.filter((item: CallDocument) => item?.status === "missed").map((item: CallDocument) => item.$id),
                  title: "Missed call",
                  body: `${currentUser?.name || currentUser?.username || "Someone"} tried to call you.`,
                  url: "/messages",
                  tag: `vimore-missed-call-${call.channel_id}`,
                  data: { type: "MISSED_CALL", callDocId: call.$id },
                });
              }
            })
            .catch(() => {
              // The callee may answer at the timeout boundary; the server resolves that race.
            });
        }, delay);
      });

    return () => timers.forEach(clearTimeout);
  }, [apiRequest, callEntries, currentUser?.$id, currentUser?.name, currentUser?.username, upsertDocument]);

  const showError = useCallback((errorValue: unknown, title = "Call action failed") => {
    const message = errorValue instanceof Error ? errorValue.message : "Try again shortly.";
    setError(message);
    toast({ variant: "destructive", title, description: message });
  }, [toast]);

  const connectToCall = useCallback(async (value: unknown) => {
    const doc = parseCallDocument(value);
    const userId = currentUser?.$id;
    if (!doc || !userId || !["dialing", "ringing", "accepted"].includes(doc.status)) return;
    if (activeCall?.call.channel_id === doc.channel_id || joiningCallIds.current.has(doc.$id)) return;

    const supplied = value as Partial<CallRecord>;
    const call = {
      ...toCallRecord(doc),
      groupId: supplied.groupId || toCallRecord(doc).groupId,
      groupName: supplied.groupName || toCallRecord(doc).groupName,
    };
    joiningCallIds.current.add(doc.$id);
    setPendingConnection(call);
    setIsLoading(true);
    setError(null);
    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const result = await apiRequest("POST", { operation: "token", callDocId: doc.$id });
          if (typeof result.token !== "string" || typeof result.serverUrl !== "string") {
            throw new Error("The call service returned an incomplete connection response.");
          }
          setActiveCall({ call, peer: call.peer, token: result.token, serverUrl: result.serverUrl });
          setPendingConnection(null);
          return;
        } catch (requestError) {
          lastError = requestError;
          if (!isTransientConnectionError(requestError) || attempt === 2) throw requestError;
          await new Promise<void>((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
        }
      }
      throw lastError;
    } catch (requestError) {
      setPendingConnection(call);
      showError(requestError, "Could not join call");
    } finally {
      joiningCallIds.current.delete(doc.$id);
      setIsLoading(false);
    }
  }, [activeCall?.call.channel_id, apiRequest, currentUser?.$id, showError, toCallRecord]);

  useEffect(() => {
    if (!currentUser?.$id) {
      callDocumentsRef.current.clear();
      setCallDocuments({});
      setActiveCall(null);
      setPendingConnection(null);
      return;
    }

    const userId = currentUser.$id;
    let disposed = false;
    const channel = `databases.${DATABASE_ID}.collections.${COL.CALLS}.documents`;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = client.subscribe(channel, (event: any) => {
        const payload = parseCallDocument(event?.payload);
        if (payload && (payload.caller_id === userId || payload.callee_id === userId)) {
          upsertDocument(payload);
        }
      });
    } catch (subscriptionError) {
      console.error("[calls] realtime subscription failed:", subscriptionError);
    }

    void Promise.all([
      databases.listDocuments(DATABASE_ID, COL.CALLS, [Query.equal("caller_id", userId), Query.limit(100)]),
      databases.listDocuments(DATABASE_ID, COL.CALLS, [Query.equal("callee_id", userId), Query.limit(100)]),
    ]).then(([asCaller, asCallee]) => {
      if (disposed) return;
      [...asCaller.documents, ...asCallee.documents].forEach(upsertDocument);
    }).catch((loadError) => {
      if (!disposed) console.warn("[calls] could not load call state:", loadError);
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [currentUser?.$id, upsertDocument]);

  useEffect(() => {
    if (!currentUser?.$id || !hasActiveCalls) return;

    let disposed = false;
    let refreshing = false;
    const refreshCallState = async () => {
      if (disposed || refreshing || document.visibilityState !== "visible") return;
      refreshing = true;
      try {
        const [asCaller, asCallee] = await Promise.all([
          databases.listDocuments(DATABASE_ID, COL.CALLS, [
            Query.equal("caller_id", currentUser.$id),
            Query.limit(100),
          ]),
          databases.listDocuments(DATABASE_ID, COL.CALLS, [
            Query.equal("callee_id", currentUser.$id),
            Query.limit(100),
          ]),
        ]);
        if (!disposed) {
          [...asCaller.documents, ...asCallee.documents].forEach(upsertDocument);
        }
      } catch (refreshError) {
        if (!disposed) console.warn("[calls] fallback call-state refresh failed:", refreshError);
      } finally {
        refreshing = false;
      }
    };

    const interval = window.setInterval(() => void refreshCallState(), 5_000);
    document.addEventListener("visibilitychange", refreshCallState);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshCallState);
    };
  }, [currentUser?.$id, hasActiveCalls, upsertDocument]);

  useEffect(() => {
    if (!currentUser?.$id || activeCall || pendingConnection || isLoading) return;
    const now = Date.now();
    const resumable = callEntries.find((call) => {
      if (call.status !== "accepted" || !call.started_at) return false;
      const age = now - Date.parse(call.started_at);
      return Number.isFinite(age) && age >= 0 && age < 3 * 60_000;
    });
    if (resumable) void connectToCall(resumable);
  }, [activeCall, callEntries, connectToCall, currentUser?.$id, isLoading, pendingConnection]);

  useEffect(() => {
    if (!activeCall) return;
    const latest = callDocuments[activeCall.call.$id];
    if (latest && ["rejected", "missed", "ended", "busy"].includes(latest.status)) {
      joiningCallIds.current.delete(activeCall.call.$id);
      setActiveCall(null);
    }
  }, [activeCall, callDocuments]);

  useEffect(() => {
    if (!pendingConnection) return;
    const latest = callDocuments[pendingConnection.$id];
    if (latest && ["rejected", "missed", "ended", "busy"].includes(latest.status)) {
      setPendingConnection(null);
    }
  }, [callDocuments, pendingConnection]);

  const startCall = useCallback(async (peer: CallPeer, type: CallType) => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await apiRequest("POST", { operation: "start", calleeId: peer.$id, type });
      upsertDocument(result.call);
      firePush({
        userId: peer.$id,
        sourceId: result.call.$id,
        title: `Incoming ${type} call`,
        body: `${currentUser?.name || currentUser?.username || "Someone"} is calling you.`,
        url: "/messages",
        tag: `vimore-call-${result.call.$id}`,
        requireInteraction: true,
        data: { type: "INCOMING_CALL", callDocId: result.call.$id, callType: type },
      });
    } catch (requestError) {
      showError(requestError, "Could not start call");
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, currentUser?.name, currentUser?.username, showError, upsertDocument]);

  const startGroupCall = useCallback(async (
    groupId: string,
    groupName: string,
    participants: CallPeer[],
    type: CallType,
  ) => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await apiRequest("POST", {
        operation: "group",
        groupId,
        participantIds: participants.map((participant) => participant.$id),
        type,
      });
      const docs = Array.isArray(result.calls) ? result.calls : [result.call];
      docs.forEach(upsertDocument);
      const invitedUserIds = docs
        .filter((call: CallDocument) => call?.callee_id && call.callee_id !== currentUser?.$id)
        .map((call: CallDocument) => call.callee_id);
      if (invitedUserIds.length) {
        firePush({
          userIds: invitedUserIds,
          sourceIds: docs
            .filter((call: CallDocument) => call?.callee_id && call.callee_id !== currentUser?.$id)
            .map((call: CallDocument) => call.$id),
          title: `Incoming group ${type} call`,
          body: `${currentUser?.name || currentUser?.username || "Someone"} started a call in ${groupName}.`,
          url: "/messages",
          tag: `vimore-call-group-${groupId}`,
          requireInteraction: true,
          data: { type: "INCOMING_CALL", groupId, callType: type },
        });
      }
      const first = parseCallDocument(result.call || docs[0]);
      if (first) {
        const record = {
          ...toCallRecord(first),
          groupId,
          groupName,
        };
        upsertDocument(first);
        await connectToCall(record);
      }
    } catch (requestError) {
      showError(requestError, "Could not start group call");
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, connectToCall, currentUser?.$id, currentUser?.name, currentUser?.username, showError, toCallRecord, upsertDocument]);

  const setCallAction = useCallback(async (action: "accept" | "reject" | "cancel" | "end", call: CallRecord) => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await apiRequest("PATCH", { action, callDocId: call.$id });
      const updatedCalls = Array.isArray(result.calls) ? result.calls : result.call ? [result.call] : [];
      updatedCalls.forEach(upsertDocument);
      if (action === "accept" && result.call) await connectToCall(result.call);
      if (action === "end" || action === "reject" || action === "cancel") {
        if (activeCall?.call.channel_id === call.channel_id) setActiveCall(null);
        if (pendingConnection?.channel_id === call.channel_id) setPendingConnection(null);
      }
    } catch (requestError) {
      showError(requestError, action === "accept" ? "Could not answer call" : "Call action failed");
    } finally {
      setIsLoading(false);
    }
  }, [activeCall?.call.channel_id, apiRequest, connectToCall, pendingConnection?.channel_id, showError, upsertDocument]);

  const acceptCall = useCallback((call: CallRecord) => setCallAction("accept", call), [setCallAction]);
  const rejectCall = useCallback((call: CallRecord) => setCallAction("reject", call), [setCallAction]);
  const cancelCall = useCallback((call: CallRecord) => setCallAction("cancel", call), [setCallAction]);
  const endCall = useCallback(async () => {
    const call = activeCall?.call || pendingConnection;
    if (call) await setCallAction("end", call);
  }, [activeCall, pendingConnection, setCallAction]);

  const retryConnection = useCallback(async () => {
    if (pendingConnection) await connectToCall(pendingConnection);
  }, [connectToCall, pendingConnection]);

  const joinGroupCall = useCallback(async (call: CallRecord) => {
    if (!call.groupId) return;
    if (call.status === "ringing" && call.callee_id === currentUser?.$id) {
      await setCallAction("accept", call);
      return;
    }
    if (
      call.status === "accepted" ||
      (call.status === "ringing" && call.caller_id === currentUser?.$id)
    ) {
      await connectToCall(call);
    }
  }, [connectToCall, currentUser?.$id, setCallAction]);

  const handleExternalCallAction = useCallback(async (action: "accept" | "reject", callDocId: string) => {
    try {
      const document = await databases.getDocument(DATABASE_ID, COL.CALLS, callDocId);
      const call = parseCallDocument(document);
      if (!call) throw new Error("This call is no longer available.");
      await setCallAction(action, toCallRecord(call));
    } catch (actionError) {
      showError(actionError, "Could not answer call");
    }
  }, [setCallAction, showError, toCallRecord]);

  const inviteParticipant = useCallback(async (peer: CallPeer) => {
    if (!activeCall) return;
    setError(null);
    setIsLoading(true);
    try {
      const result = await apiRequest("POST", {
        operation: "invite",
        callDocId: activeCall.call.$id,
        calleeId: peer.$id,
        type: activeCall.call.type,
      });
      upsertDocument(result.call);
      firePush({
        userId: peer.$id,
        sourceId: result.call.$id,
        title: `Incoming ${activeCall.call.type} call`,
        body: `${currentUser?.name || currentUser?.username || "Someone"} invited you to a call.`,
        url: "/messages",
        tag: `vimore-call-${result.call.$id}`,
        requireInteraction: true,
        data: {
          type: "INCOMING_CALL",
          callDocId: result.call.$id,
          callType: activeCall.call.type,
        },
      });
      toast({ title: "Invitation sent", description: `${peer.name} was invited to the call.` });
    } catch (requestError) {
      showError(requestError, "Could not invite participant");
    } finally {
      setIsLoading(false);
    }
  }, [activeCall, apiRequest, currentUser?.name, currentUser?.username, showError, toast, upsertDocument]);

  const sendQuickReply = useCallback(async (text: string) => {
    const call = incomingCall;
    if (!call || !text.trim()) return;
    const recipient = call.peer.username || call.peer.$id;
    try {
      await sendChatMessage(recipient, { text: text.trim(), type: "text" });
      await setCallAction("reject", call);
    } catch (sendError) {
      showError(sendError, "Could not send reply");
    }
  }, [incomingCall, sendChatMessage, setCallAction, showError]);

  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type !== "CALL_ACTION" || typeof data.callDocId !== "string") return;
      const action = data.action === "accept" ? "accept" : data.action === "decline" || data.action === "reject" ? "reject" : null;
      if (!action) return;
      void handleExternalCallAction(action, data.callDocId);
    };

    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
    const params = new URLSearchParams(window.location.search);
    const action = params.get("call_action");
    const callDocId = params.get("call_doc_id");
    if (callDocId && (action === "accept" || action === "decline")) {
      void handleExternalCallAction(action === "accept" ? "accept" : "reject", callDocId);
      params.delete("call_action");
      params.delete("call_doc_id");
      params.delete("call_type");
      params.delete("caller_name");
      const remaining = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${remaining ? `?${remaining}` : ""}${window.location.hash}`);
    }

    return () => navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
  }, [handleExternalCallAction]);

  const value = useMemo<CallContextValue>(() => ({
    incomingCall,
    outgoingCall,
    activeCall,
    pendingConnection,
    groupCalls,
    isLoading,
    error,
    startCall,
    startGroupCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    retryConnection,
    joinGroupCall,
    inviteParticipant,
    sendQuickReply,
  }), [
    incomingCall,
    outgoingCall,
    activeCall,
    pendingConnection,
    groupCalls,
    isLoading,
    error,
    startCall,
    startGroupCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    retryConnection,
    joinGroupCall,
    inviteParticipant,
    sendQuickReply,
  ]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used inside CallProvider.");
  return context;
}