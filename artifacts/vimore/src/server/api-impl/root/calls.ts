import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

function signLiveKitJwt(params: {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  identity: string;
  name?: string;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      exp: now + 3600,
      nbf: now - 5,
      iss: params.apiKey,
      sub: params.identity,
      name: params.name || params.identity,
      video: {
        room: params.roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', params.apiSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function mintCallToken(roomName: string, identity: string, name: string) {
  const gatewayUrl = process.env.MTL_GATEWAY_URL || 'https://mrtc.mediatechliberia.online/api/livekit/token';
  const accountId = process.env.MTL_ACCOUNT_ID || 'MTL_63276';
  const apiKey =
    process.env.MTL_ACCOUNT_SERCET ||
    process.env.MTL_ACCOUNT_SECRET ||
    process.env.MTL_API_KEY ||
    '';
  const lkKey = process.env.LIVEKIT_API_KEY || '';
  const lkSecret = process.env.LIVEKIT_API_SECRET || '';
  const lkUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

  if (lkKey && lkSecret && lkUrl) {
    return {
      token: signLiveKitJwt({
        apiKey: lkKey,
        apiSecret: lkSecret,
        roomName,
        identity,
        name,
      }),
      serverUrl: lkUrl,
    };
  }

  if (gatewayUrl && accountId) {
    const res = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey
          ? {
              Authorization: `Bearer ${apiKey}`,
              'X-MTL-API-Key': apiKey,
              'X-MTL-Account-Secret': apiKey,
            }
          : {}),
      },
      body: JSON.stringify({
        accountId,
        ...(apiKey ? { accountSecret: apiKey } : {}),
        roomName,
        participantIdentity: identity,
        participantName: name,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) {
      throw new Error(data?.error || `Gateway token error (${res.status})`);
    }
    return {
      token: String(data.token),
      serverUrl: String(data.serverUrl || data.url || lkUrl || ''),
    };
  }

  throw new Error('Call service is not configured on this server.');
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const operation = String(body.operation || 'start');
    const db = getAdminDatabases();
    const userId = session.authUser.$id;
    const displayName = String(session.profileDoc?.name || session.profileDoc?.username || 'ViMore User');

    if (operation === 'token') {
      const callDocId = String(body.callDocId || '').trim();
      if (!callDocId) return NextResponse.json({ error: 'callDocId required' }, { status: 400 });
      const call = await db.getDocument(DATABASE_ID, COL.CALLS, callDocId);
      if (call.caller_id !== userId && call.callee_id !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { token, serverUrl } = await mintCallToken(call.channel_id, userId, displayName);
      return NextResponse.json({ ok: true, token, serverUrl });
    }

    if (operation === 'group') {
      const groupId = String(body.groupId || '').trim();
      const participantIds: string[] = Array.isArray(body.participantIds) ? body.participantIds : [];
      const type = body.type === 'video' ? 'video' : 'audio';
      if (!groupId) return NextResponse.json({ error: 'groupId required' }, { status: 400 });
      const channelId = `group_call_${groupId}`;
      const now = new Date().toISOString();

      const targets = [...new Set(participantIds.filter((id) => id && id !== userId))];
      if (targets.length === 0) targets.push(userId);

      const calls = [];
      for (const calleeId of targets) {
        const doc = await db.createDocument(DATABASE_ID, COL.CALLS, ID.unique(), {
          channel_id: channelId,
          caller_id: userId,
          callee_id: calleeId,
          type,
          status: calleeId === userId ? 'accepted' : 'ringing',
          started_at: now,
        });
        calls.push(doc);
      }
      return NextResponse.json({ ok: true, call: calls[0], calls });
    }

    if (operation === 'invite') {
      const callDocId = String(body.callDocId || '').trim();
      const calleeId = String(body.calleeId || '').trim();
      const type = body.type === 'video' ? 'video' : 'audio';
      if (!callDocId || !calleeId) {
        return NextResponse.json({ error: 'callDocId and calleeId required' }, { status: 400 });
      }
      const existing = await db.getDocument(DATABASE_ID, COL.CALLS, callDocId);
      const doc = await db.createDocument(DATABASE_ID, COL.CALLS, ID.unique(), {
        channel_id: existing.channel_id,
        caller_id: userId,
        callee_id: calleeId,
        type,
        status: 'ringing',
        started_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, call: doc });
    }

    // Default: start 1:1 call
    const calleeId = String(body.calleeId || '').trim();
    const type = body.type === 'video' ? 'video' : 'audio';
    if (!calleeId) return NextResponse.json({ error: 'calleeId required' }, { status: 400 });
    const channelId = `call_${[userId, calleeId].sort().join('_')}_${Date.now()}`;
    const doc = await db.createDocument(DATABASE_ID, COL.CALLS, ID.unique(), {
      channel_id: channelId,
      caller_id: userId,
      callee_id: calleeId,
      type,
      status: 'ringing',
      started_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, call: doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Call operation failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const callDocId = String(body.callDocId || '').trim();
    const action = String(body.action || '').trim();
    if (!callDocId || !action) {
      return NextResponse.json({ error: 'callDocId and action required' }, { status: 400 });
    }

    const statusMap: Record<string, string> = {
      accept: 'accepted',
      reject: 'rejected',
      cancel: 'ended',
      end: 'ended',
      missed: 'missed',
    };
    const nextStatus = statusMap[action];
    if (!nextStatus) {
      return NextResponse.json({ error: 'Invalid call action' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const call = await db.getDocument(DATABASE_ID, COL.CALLS, callDocId);
    if (call.caller_id !== session.authUser.$id && call.callee_id !== session.authUser.$id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isGroup = String(call.channel_id || '').startsWith('group_call_');
    if (isGroup && ['cancel', 'end', 'missed'].includes(action)) {
      const siblings = await db.listDocuments(DATABASE_ID, COL.CALLS, [
        Query.equal('channel_id', call.channel_id),
        Query.limit(100),
      ]);
      const updatedCalls = [];
      for (const s of siblings.documents) {
        if (['dialing', 'ringing', 'accepted'].includes(s.status)) {
          const u = await db.updateDocument(DATABASE_ID, COL.CALLS, s.$id, {
            status: nextStatus,
            ended_at: new Date().toISOString(),
          });
          updatedCalls.push(u);
        }
      }
      return NextResponse.json({ ok: true, call: updatedCalls[0] || call, calls: updatedCalls });
    }

    const updated = await db.updateDocument(DATABASE_ID, COL.CALLS, callDocId, {
      status: nextStatus,
      ...(nextStatus !== 'accepted' ? { ended_at: new Date().toISOString() } : {}),
    });

    return NextResponse.json({ ok: true, call: updated, calls: [updated] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Call update failed' }, { status: 500 });
  }
}
