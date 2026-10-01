import { NextRequest, NextResponse } from 'next/server';
import { ID, Permission, Query, Role } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';
import { rateLimit, sanitizeIp } from '@/lib/rate-limit';
import { persistCallChatLogs } from './call-chat-log';

export const maxDuration = 30;

const CALLS = 'calls';
const ACTIVE_STATUSES = new Set(['dialing', 'ringing', 'accepted']);
const PENDING_STATUSES = new Set(['dialing', 'ringing']);
const CALL_RING_TIMEOUT_MS = 45_000;
const CALL_TYPES = new Set(['audio', 'video']);
const ID_PATTERN = /^[a-zA-Z0-9._-]{1,36}$/;

type CallType = 'audio' | 'video';
type CallAction = 'accept' | 'reject' | 'cancel' | 'end' | 'missed';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isCallType(value: unknown): value is CallType {
  return typeof value === 'string' && CALL_TYPES.has(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function getPermissions(userIds: string[]) {
  return [...new Set(userIds)].map((userId) => Permission.read(Role.user(userId)));
}

function secondsSince(startedAt: unknown, endedAtMs = Date.now()): number {
  if (typeof startedAt !== 'string') return 0;
  const startMs = Date.parse(startedAt);
  return Number.isFinite(startMs) ? Math.max(0, Math.floor((endedAtMs - startMs) / 1000)) : 0;
}

function isCallExpired(call: any, nowMs = Date.now()) {
  if (!PENDING_STATUSES.has(String(call.status))) return false;
  const createdAt = Date.parse(String(call.$createdAt || call.created_at || ''));
  return Number.isFinite(createdAt) && nowMs - createdAt >= CALL_RING_TIMEOUT_MS;
}

function earliestCallCreatedAt(calls: any[]) {
  const createdCalls = calls
    .filter((item) => typeof item.$createdAt === 'string' && Number.isFinite(Date.parse(item.$createdAt)))
    .sort((a, b) => Date.parse(a.$createdAt) - Date.parse(b.$createdAt));
  return createdCalls[0]?.$createdAt || '';
}

function groupCallSessionAnchor(calls: any[]) {
  const hostSession = calls.find((item) =>
    item.caller_id === item.callee_id && String(item.channel_id || '').startsWith('group_call_'),
  );
  return String(hostSession?.$id || earliestCallStart(calls) || earliestCallCreatedAt(calls) || calls[0]?.$id || 'unknown');
}

async function markCallMissed(db: ReturnType<typeof getAdminDatabases>, call: any, now = new Date()) {
  const updated = await db.updateDocument(DATABASE_ID, CALLS, call.$id, {
    status: 'missed',
    ended_at: now.toISOString(),
    duration: 0,
  });
  await persistCallChatLogs(db, updated, 'missed', {
    eventKey: `call:${call.$id}:missed`,
  });
  return updated;
}

async function markExpiredGroupCallsMissed(
  db: ReturnType<typeof getAdminDatabases>,
  call: any,
  now = new Date(),
) {
  const room = await db.listDocuments(DATABASE_ID, CALLS, [
    Query.equal('channel_id', call.channel_id),
    Query.limit(100),
  ]);
  const expiredCalls = room.documents.filter((item) => isCallExpired(item, now.getTime()));
  if (!expiredCalls.length) return [];

  const updated = [];
  for (const item of expiredCalls) {
    updated.push(await db.updateDocument(DATABASE_ID, CALLS, item.$id, {
      status: 'missed',
      ended_at: now.toISOString(),
      duration: 0,
    }));
  }

  const hostSession = room.documents.find((item) => item.caller_id === item.callee_id);
  await persistCallChatLogs(db, hostSession || updated[0], 'missed', {
    eventKey: `group:${call.channel_id}:${groupCallSessionAnchor(room.documents)}:missed`,
  });
  return updated;
}

function earliestCallStart(calls: any[]) {
  const startedCalls = calls
    .filter((item) => typeof item.started_at === 'string' && Number.isFinite(Date.parse(item.started_at)))
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  return startedCalls[0]?.started_at || '';
}

type CallAuthResult =
  | { session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>> }
  | { response: NextResponse };

async function authenticate(req: NextRequest): Promise<CallAuthResult> {
  const ip = sanitizeIp(req.headers.get('x-forwarded-for')?.split(',')[0]);
  const ipLimit = rateLimit(`calls-ip:${ip}`, 90, 60_000);
  if (!ipLimit.allowed) return { response: jsonError('Too many call requests. Try again shortly.', 429) };

  const session = await getSessionUser(req);
  if (!session) return { response: jsonError('Authentication required.', 401) };

  const userLimit = rateLimit(`calls-user:${session.userId}`, 45, 60_000);
  if (!userLimit.allowed) return { response: jsonError('Too many call requests. Try again shortly.', 429) };

  return { session };
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function activeCallsForUser(db: ReturnType<typeof getAdminDatabases>, userId: string) {
  const [asCaller, asCallee] = await Promise.all([
    db.listDocuments(DATABASE_ID, CALLS, [Query.equal('caller_id', userId), Query.limit(100)]),
    db.listDocuments(DATABASE_ID, CALLS, [Query.equal('callee_id', userId), Query.limit(100)]),
  ]);
  const distinctCalls = new Map(
    [...asCaller.documents, ...asCallee.documents].map((doc) => [doc.$id, doc]),
  );
  const activeCalls = [...distinctCalls.values()]
    .filter((doc) => ACTIVE_STATUSES.has(String(doc.status)));
  const currentCalls = [];
  const expiredGroupRooms = new Set<string>();
  for (const call of activeCalls) {
    if (isCallExpired(call)) {
      if (String(call.channel_id || '').startsWith('group_call_')) {
        if (!expiredGroupRooms.has(call.channel_id)) {
          expiredGroupRooms.add(call.channel_id);
          await markExpiredGroupCallsMissed(db, call);
        }
      } else {
        await markCallMissed(db, call);
      }
    } else {
      currentCalls.push(call);
    }
  }
  return currentCalls;
}

async function createDirectCall(body: Record<string, unknown>, userId: string) {
  const calleeId = body.calleeId;
  if (!isId(calleeId) || calleeId === userId || !isCallType(body.type)) {
    return jsonError('A valid contact and call type are required.', 400);
  }

  const db = getAdminDatabases();
  let callee: any;
  try {
    callee = await db.getDocument(DATABASE_ID, 'users', calleeId);
  } catch {
    return jsonError('That user could not be found.', 404);
  }

  const [callerCalls, calleeCalls] = await Promise.all([
    activeCallsForUser(db, userId),
    activeCallsForUser(db, calleeId),
  ]);
  if (callerCalls.length || calleeCalls.length) {
    return jsonError(callerCalls.length ? 'End your current call before starting another.' : 'This person is already in a call.', 409);
  }

  const call = await db.createDocument(
    DATABASE_ID,
    CALLS,
    ID.unique(),
    {
      caller_id: userId,
      callee_id: calleeId,
      status: 'dialing',
      type: body.type,
      duration: 0,
      channel_id: `call_${ID.unique()}`,
    },
    getPermissions([userId, calleeId])
  );

  return NextResponse.json({ call, callee: { $id: callee.$id, name: callee.name || 'ViMore user' } }, { status: 201 });
}

async function createGroupCall(body: Record<string, unknown>, userId: string) {
  const groupId = body.groupId;
  const participantIds = body.participantIds;
  if (!isId(groupId) || !isCallType(body.type) || !Array.isArray(participantIds) || participantIds.length < 1 || participantIds.length > 99) {
    return jsonError('A group, at least one member, and a valid call type are required.', 400);
  }
  if (participantIds.some((id) => !isId(id)) || new Set(participantIds).size !== participantIds.length) {
    return jsonError('The participant list is invalid.', 400);
  }

  const db = getAdminDatabases();
  let group: any;
  try {
    group = await db.getDocument(DATABASE_ID, 'clusters', groupId);
  } catch {
    return jsonError('That group could not be found.', 404);
  }

  let memberResult: any;
  try {
    memberResult = await db.listDocuments(DATABASE_ID, 'cluster_members', [
      Query.equal('cluster_id', groupId),
      Query.limit(100),
    ]);
  } catch (error: any) {
    console.error('[calls] group membership lookup failed:', error?.code ?? 'unknown');
    return jsonError('Group membership could not be verified.', 503);
  }

  const memberIds = new Set<string>(
    memberResult.documents.map((doc: any) => String(doc.user_id || '')).filter(Boolean)
  );
  let isGroupAdmin = false;
  if (typeof group.admin_username === 'string' && group.admin_username) {
    try {
      const profile = await db.getDocument(DATABASE_ID, 'users', userId);
      isGroupAdmin = profile.username === group.admin_username;
    } catch {
      isGroupAdmin = false;
    }
  }
  if (!memberIds.has(userId) && !isGroupAdmin) {
    return jsonError('You must belong to this group to start its call.', 403);
  }

  const suppliedParticipants = participantIds.filter((id: string) => id !== userId);
  if (suppliedParticipants.some((id: string) => !memberIds.has(id))) {
    return jsonError('The participant list includes someone outside this group.', 403);
  }
  const callees = suppliedParticipants as string[];
  if (!callees.length) return jsonError('There are no other group members to call.', 400);

  const channelId = `group_call_${groupId}`;
  const existing = await db.listDocuments(DATABASE_ID, CALLS, [
    Query.equal('channel_id', channelId),
    Query.limit(100),
  ]);
  if (existing.documents.some((doc) => ACTIVE_STATUSES.has(String(doc.status)))) {
    return jsonError('This group already has an active call.', 409);
  }

  const now = new Date().toISOString();
  const hostSession = await db.createDocument(
    DATABASE_ID,
    CALLS,
    ID.unique(),
    {
      caller_id: userId,
      callee_id: userId,
      status: 'accepted',
      type: body.type,
      started_at: now,
      duration: 0,
      channel_id: `group_call_${groupId}`,
    },
    getPermissions([userId])
  );
  const calls = [hostSession];
  for (const calleeId of callees) {
    calls.push(await db.createDocument(
      DATABASE_ID,
      CALLS,
      ID.unique(),
      {
        caller_id: userId,
        callee_id: calleeId,
        status: 'ringing',
        type: body.type,
        duration: 0,
        channel_id: hostSession.channel_id,
      },
      getPermissions([userId, calleeId])
    ));
  }
  return NextResponse.json({ calls, call: hostSession }, { status: 201 });
}

async function inviteToCall(body: Record<string, unknown>, userId: string) {
  const callDocId = body.callDocId;
  const calleeId = body.calleeId;
  if (!isId(callDocId) || !isId(calleeId) || !isCallType(body.type)) {
    return jsonError('A valid active call and participant are required.', 400);
  }
  if (calleeId === userId) return jsonError('You cannot invite yourself.', 400);

  const db = getAdminDatabases();
  let source: any;
  try {
    source = await db.getDocument(DATABASE_ID, CALLS, callDocId);
  } catch {
    return jsonError('That call could not be found.', 404);
  }
  if (source.caller_id !== userId && source.callee_id !== userId) {
    return jsonError('You are not a participant in this call.', 403);
  }
  if (!ACTIVE_STATUSES.has(String(source.status))) {
    return jsonError('This call has already ended.', 409);
  }

  let invitee: any;
  try {
    invitee = await db.getDocument(DATABASE_ID, 'users', calleeId);
  } catch {
    return jsonError('That user could not be found.', 404);
  }
  const existing = await db.listDocuments(DATABASE_ID, CALLS, [
    Query.equal('channel_id', source.channel_id),
    Query.limit(100),
  ]);
  if (existing.documents.some((doc) => doc.callee_id === calleeId && ACTIVE_STATUSES.has(String(doc.status)))) {
    return jsonError('This person is already invited to the call.', 409);
  }

  const call = await db.createDocument(
    DATABASE_ID,
    CALLS,
    ID.unique(),
    {
      caller_id: userId,
      callee_id: calleeId,
      status: 'ringing',
      type: body.type,
      duration: 0,
      channel_id: source.channel_id,
    },
    getPermissions([userId, calleeId])
  );
  return NextResponse.json({ call, invitee: { $id: invitee.$id, name: invitee.name || 'ViMore user' } }, { status: 201 });
}

async function createRtcToken(body: Record<string, unknown>, userId: string) {
  const callDocId = body.callDocId;
  if (!isId(callDocId)) return jsonError('A valid call is required.', 400);

  const accountId = process.env.MTL_ACCOUNT_ID;
  const accountSecret = process.env.MTL_ACCOUNT_SECRET;
  const gatewayUrl = process.env.MTL_GATEWAY_URL;
  if (!accountId || !accountSecret || !gatewayUrl) {
    console.error('[calls] RTC token gateway configuration is incomplete.');
    return jsonError('The call service is not configured yet.', 503);
  }

  const db = getAdminDatabases();
  let call: any;
  try {
    call = await db.getDocument(DATABASE_ID, CALLS, callDocId);
  } catch {
    return jsonError('That call could not be found.', 404);
  }
  const isCaller = call.caller_id === userId;
  const isCallee = call.callee_id === userId;
  if ((!isCaller && !isCallee) || !ACTIVE_STATUSES.has(String(call.status)) || (isCallee && call.status !== 'accepted')) {
    return jsonError('You are not allowed to join this call yet.', 403);
  }

  let userName = 'ViMore user';
  try {
    const profile = await db.getDocument(DATABASE_ID, 'users', userId);
    userName = profile.name || userName;
  } catch {
    // Account identity has already been verified; a missing profile only affects the display name.
  }

  let response: Response;
  try {
    response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MTL-Account-ID': accountId,
        'X-MTL-Account-Secret': accountSecret,
      },
      body: JSON.stringify({
        accountId,
        roomName: call.channel_id,
        participantIdentity: userId,
        participantName: userName,
        role: 'publisher',
        type: call.type,
      }),
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    });
  } catch (error: any) {
    console.error('[calls] RTC token gateway request failed:', error?.name ?? 'network error');
    return jsonError('The call service could not be reached. Try again shortly.', 502);
  }

  const raw = await response.json().catch(() => null);
  if (!response.ok || !raw || typeof raw !== 'object') {
    console.error('[calls] RTC token gateway returned status:', response.status);
    return jsonError('The call service could not issue a connection token.', 502);
  }
  const result = (raw as any).data && typeof (raw as any).data === 'object' ? (raw as any).data : raw;
  const token = result.token || result.accessToken || result.access_token || result.jwt;
  const serverUrl = result.serverUrl || result.server_url || result.livekitUrl || result.url;
  if (typeof token !== 'string' || !token || typeof serverUrl !== 'string' || !/^wss?:\/\//i.test(serverUrl)) {
    console.error('[calls] RTC token gateway response omitted a usable token or LiveKit URL.');
    return jsonError('The call service returned an incomplete connection response.', 502);
  }

  return NextResponse.json({ token, serverUrl });
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const auth = await authenticate(req);
    if ('response' in auth) return auth.response;
    const body = await readBody(req);
    if (!body || typeof body.operation !== 'string') return jsonError('A call operation is required.', 400);

    switch (body.operation) {
      case 'start':
        return createDirectCall(body, auth.session.userId);
      case 'group':
        return createGroupCall(body, auth.session.userId);
      case 'invite':
        return inviteToCall(body, auth.session.userId);
      case 'token':
        return createRtcToken(body, auth.session.userId);
      default:
        return jsonError('Unsupported call operation.', 400);
    }
  } catch (error: any) {
    console.error('[calls] POST failed:', error?.code ?? error?.name ?? 'unknown error');
    return jsonError('The call request failed. Try again shortly.', 500);
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  try {
    const auth = await authenticate(req);
    if ('response' in auth) return auth.response;
    const body = await readBody(req);
    const action = body?.action;
    const callDocId = body?.callDocId;
    if (!isId(callDocId) || typeof action !== 'string' || !['accept', 'reject', 'cancel', 'end', 'missed'].includes(action)) {
      return jsonError('A valid call action is required.', 400);
    }

    const db = getAdminDatabases();
    let call: any;
    try {
      call = await db.getDocument(DATABASE_ID, CALLS, callDocId);
    } catch {
      return jsonError('That call could not be found.', 404);
    }

    const userId = auth.session.userId;
    const isCaller = call.caller_id === userId;
    const isCallee = call.callee_id === userId;
    if (!isCaller && !isCallee) return jsonError('You are not a participant in this call.', 403);

    if (action === 'missed' && call.status === 'missed') {
      if (String(call.channel_id || '').startsWith('group_call_')) {
        const sameRoom = await db.listDocuments(DATABASE_ID, CALLS, [
          Query.equal('channel_id', call.channel_id),
          Query.limit(100),
        ]);
        const hostSession = sameRoom.documents.find((item) => item.caller_id === item.callee_id);
        await persistCallChatLogs(db, hostSession || call, 'missed', {
          eventKey: `group:${call.channel_id}:${groupCallSessionAnchor(sameRoom.documents)}:missed`,
        });
      } else {
        await persistCallChatLogs(db, call, 'missed', {
          eventKey: `call:${call.$id}:missed`,
        });
      }
      return NextResponse.json({ call });
    }
    if (action === 'reject' && call.status === 'rejected') {
      await persistCallChatLogs(db, call, 'declined', {
        eventKey: `call:${call.$id}:declined`,
      });
      return NextResponse.json({ call });
    }
    if (action === 'end' && call.status === 'ended' && typeof call.channel_id === 'string') {
      const sameRoom = await db.listDocuments(DATABASE_ID, CALLS, [
        Query.equal('channel_id', call.channel_id),
        Query.limit(100),
      ]);
      const sameEnding = sameRoom.documents.filter((item) => item.ended_at === call.ended_at);
      const duration = Math.max(0, ...sameEnding.map((item) => Number(item.duration) || 0));
      const eventKey = call.channel_id.startsWith('group_call_')
        ? `group:${call.channel_id}:${earliestCallStart(sameEnding) || call.ended_at || call.$id}:completed`
        : `direct-room:${call.channel_id}:completed`;
      await persistCallChatLogs(db, call, 'completed', {
        eventKey,
        duration,
        participantCalls: sameEnding,
      });
      return NextResponse.json({ call });
    }

    if (action === 'accept' && !isCallee) {
      return jsonError('Only the invited participant can accept this call.', 409);
    }
    if (action === 'accept' && isCallExpired(call)) {
      if (String(call.channel_id || '').startsWith('group_call_')) {
        await markExpiredGroupCallsMissed(db, call);
      } else {
        await markCallMissed(db, call);
      }
      return jsonError('This call timed out and was recorded as missed.', 409);
    }
    if (action === 'accept' && (!isCallee || !['dialing', 'ringing'].includes(String(call.status)))) {
      return jsonError('This call cannot be accepted.', 409);
    }
    if (action === 'reject' && (!isCallee || !['dialing', 'ringing'].includes(String(call.status)))) {
      return jsonError('This call cannot be declined.', 409);
    }
    if (action === 'cancel' && (!isCaller || !PENDING_STATUSES.has(String(call.status)))) {
      return jsonError('This call can no longer be cancelled.', 409);
    }
    if (action === 'end' && !ACTIVE_STATUSES.has(String(call.status))) {
      return jsonError('This call has already ended.', 409);
    }
    if (action === 'missed' && (!isCaller || !PENDING_STATUSES.has(String(call.status)) || !isCallExpired(call))) {
      return jsonError('Only the caller can mark a timed-out call as missed.', 409);
    }

    if (action === 'missed') {
      const updatedCalls = String(call.channel_id || '').startsWith('group_call_')
        ? await markExpiredGroupCallsMissed(db, call)
        : [await markCallMissed(db, call)];
      return NextResponse.json({
        call: updatedCalls.find((item: any) => item.$id === call.$id) || call,
        calls: updatedCalls,
      });
    }

    if (action === 'cancel') {
      const updated = await markCallMissed(db, call);
      return NextResponse.json({ call: updated });
    }

    const now = new Date();
    const endedAt = now.toISOString();
    const terminalStatus = action === 'accept'
      ? 'accepted'
      : action === 'reject'
        ? 'rejected'
        : 'ended';
    const update = action === 'accept'
      ? { status: terminalStatus, started_at: now.toISOString(), duration: 0 }
      : { status: terminalStatus, ended_at: endedAt, duration: secondsSince(call.started_at, now.getTime()) };

    if (action === 'end' && typeof call.channel_id === 'string' && call.channel_id) {
      const sameRoom = await db.listDocuments(DATABASE_ID, CALLS, [
        Query.equal('channel_id', call.channel_id),
        Query.limit(100),
      ]);
      const activeRoomCalls = sameRoom.documents.filter((participantCall) =>
        ACTIVE_STATUSES.has(String(participantCall.status)),
      );
      const groupRoom = call.channel_id.startsWith('group_call_');
      const pendingRoomCalls = activeRoomCalls.filter((participantCall) =>
        PENDING_STATUSES.has(String(participantCall.status)),
      );
      const updated = [];
      for (const participantCall of activeRoomCalls) {
        if (PENDING_STATUSES.has(String(participantCall.status))) {
          const missedCall = await db.updateDocument(DATABASE_ID, CALLS, participantCall.$id, {
            status: 'missed',
            ended_at: endedAt,
            duration: 0,
          });
          updated.push(missedCall);
          if (!groupRoom) {
            await persistCallChatLogs(db, missedCall, 'missed', {
              eventKey: `call:${participantCall.$id}:missed`,
            });
          }
        } else {
          updated.push(await db.updateDocument(DATABASE_ID, CALLS, participantCall.$id, {
            status: 'ended',
            ended_at: endedAt,
            duration: secondsSince(participantCall.started_at, now.getTime()),
          }));
        }
      }
      if (groupRoom && pendingRoomCalls.length) {
        const hostSession = sameRoom.documents.find((item) => item.caller_id === item.callee_id);
        await persistCallChatLogs(db, hostSession || pendingRoomCalls[0], 'missed', {
          eventKey: `group:${call.channel_id}:${groupCallSessionAnchor(sameRoom.documents)}:missed`,
        });
      }
      const acceptedRoomCalls = activeRoomCalls.filter((item) =>
        item.status === 'accepted' || typeof item.started_at === 'string',
      );
      const duration = Math.max(
        0,
        ...updated
          .filter((item: any) => item.status === 'ended')
          .map((item: any) => Number(item.duration) || 0),
      );
      const eventKey = call.channel_id.startsWith('group_call_')
        ? `group:${call.channel_id}:${earliestCallStart(activeRoomCalls) || call.$createdAt || call.$id}:completed`
        : `direct-room:${call.channel_id}:completed`;
      if (acceptedRoomCalls.length) {
        await persistCallChatLogs(db, call, 'completed', {
          eventKey,
          duration,
          participantCalls: acceptedRoomCalls,
        });
      }
      return NextResponse.json({ call: updated[0] || call, calls: updated });
    }

    const updated = await db.updateDocument(DATABASE_ID, CALLS, callDocId, update);
    if (action === 'reject') {
      await persistCallChatLogs(db, updated, 'declined', {
        eventKey: `call:${callDocId}:declined`,
      });
    }
    return NextResponse.json({ call: updated });
  } catch (error: any) {
    console.error('[calls] PATCH failed:', error?.code ?? error?.name ?? 'unknown error');
    return jsonError('The call could not be updated. Try again shortly.', 500);
  }
}