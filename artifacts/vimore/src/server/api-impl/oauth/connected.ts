import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { OAUTH_COL, getOAuthClient, revokeAccessToken } from '@/lib/oauth-server';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('user_id') || '';
    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, OAUTH_COL.ACCESS_TOKENS, []);
    const activeTokens = res.documents.filter(
      (d: any) =>
        d.user_id === userId &&
        !d.revoked &&
        (!d.expires_at || new Date(d.expires_at) > new Date())
    );

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
      String(tok.scopes || '')
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
    const body = await req.json().catch(() => ({}));
    const clientId = String(body.client_id || '').trim();
    const userId = String(body.user_id || '').trim();

    if (!clientId || !userId) {
      return NextResponse.json({ error: 'client_id and user_id are required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, OAUTH_COL.ACCESS_TOKENS, []);
    const matches = res.documents.filter(
      (d: any) => d.client_id === clientId && d.user_id === userId && !d.revoked
    );

    for (const doc of matches) {
      await revokeAccessToken(doc.$id);
    }

    return NextResponse.json({ ok: true, revoked: matches.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to revoke access' }, { status: 500 });
  }
}
