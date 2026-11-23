import { NextRequest, NextResponse } from 'next/server';
import { createAuthCode, getOAuthClient } from '@/lib/oauth-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const client_id = String(body.client_id || '').trim();
    const redirect_uri = String(body.redirect_uri || '').trim();
    const scope = String(body.scope || 'profile').trim();
    const state = String(body.state || '').trim();
    const user_id = String(body.user_id || '').trim();

    if (!client_id || !redirect_uri || !user_id) {
      return NextResponse.json({ error: 'Missing required authorization parameters' }, { status: 400 });
    }

    const client: any = await getOAuthClient(client_id);
    if (!client) {
      return NextResponse.json({ error: 'Unknown application' }, { status: 404 });
    }

    const allowedUris: string[] = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
    if (!allowedUris.includes(redirect_uri)) {
      return NextResponse.json({ error: 'Invalid redirect_uri' }, { status: 400 });
    }

    const code = await createAuthCode({
      client_id,
      user_id,
      scopes: scope,
      redirect_uri,
    });

    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);

    return NextResponse.json({ redirect: url.toString(), code });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Authorization failed' }, { status: 500 });
  }
}
