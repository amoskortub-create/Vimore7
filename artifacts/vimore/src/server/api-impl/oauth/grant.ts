import { NextRequest, NextResponse } from 'next/server';
import {
  createAuthCode,
  getOAuthClient,
  isValidRedirectUri,
  normalizeScopes,
} from '@/lib/oauth-server';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const user_id = session.profileDoc?.$id || session.authUser.$id;

    const body = await req.json().catch(() => ({}));
    const client_id = String(body.client_id || '').trim();
    const redirect_uri = String(body.redirect_uri || '').trim();
    const scope = normalizeScopes(body.scope);
    const state = String(body.state || '').trim();

    if (!client_id || !redirect_uri) {
      return NextResponse.json({ error: 'Missing required authorization parameters' }, { status: 400 });
    }

    if (!isValidRedirectUri(redirect_uri)) {
      return NextResponse.json({ error: 'Invalid redirect_uri format' }, { status: 400 });
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

    return NextResponse.json({ redirect: url.toString(), code, state, scope });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Authorization failed' }, { status: 500 });
  }
}
