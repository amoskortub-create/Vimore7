import { NextRequest, NextResponse } from 'next/server';
import {
  getOAuthClient,
  listUserAccessTokens,
  revokeUserClientTokens,
} from '@/lib/oauth-server';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = session.profileDoc?.$id || session.authUser.$id;

    const activeTokens = await listUserAccessTokens(userId);

    const grouped = new Map<string, { scopes: Set<string>; granted_at: string; token_ids: string[] }>();
    for (const tok of activeTokens as any[]) {
      const cid = tok.client_id;
      if (!cid) continue;
      if (!grouped.has(cid)) {
        grouped.set(cid, {
          scopes: new Set(),
          granted_at: tok.$createdAt || new Date().toISOString(),
          token_ids: [],
        });
      }
      const entry = grouped.get(cid)!;
      String(tok.scopes || tok.scope || '')
        .split(' ')
        .filter(Boolean)
        .forEach((s) => entry.scopes.add(s));
      entry.token_ids.push(tok.$id);
    }

    const connected = await Promise.all(
      Array.from(grouped.entries()).map(async ([client_id, info]) => {
        const client: any = await getOAuthClient(client_id);
        return {
          client_id,
          name: client?.name || client_id,
          logo_url: client?.logo_url || '',
          website_url: client?.website_url || '',
          scopes: Array.from(info.scopes).join(' '),
          granted_at: info.granted_at,
          token_ids: info.token_ids,
        };
      })
    );

    return NextResponse.json({ connected });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load connected apps' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = session.profileDoc?.$id || session.authUser.$id;

    const body = await req.json().catch(() => ({}));
    const clientId = String(body.client_id || '').trim();

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const revoked = await revokeUserClientTokens(userId, clientId);
    return NextResponse.json({ ok: true, revoked });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to revoke access' }, { status: 500 });
  }
}
