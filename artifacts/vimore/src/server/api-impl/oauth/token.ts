import { NextRequest, NextResponse } from 'next/server';
import { exchangeAuthCode } from '@/lib/oauth-server';

export async function POST(req: NextRequest) {
  try {
    let params: Record<string, string> = {};
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      params = Object.fromEntries(new URLSearchParams(text).entries());
    } else {
      params = await req.json().catch(() => ({}));
    }

    const grant_type = String(params.grant_type || 'authorization_code');
    if (grant_type !== 'authorization_code') {
      return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
    }

    const code = String(params.code || '').trim();
    const client_id = String(params.client_id || '').trim();
    const redirect_uri = String(params.redirect_uri || '').trim();
    const client_secret = String(params.client_secret || '').trim();

    if (!code || !client_id || !redirect_uri || !client_secret) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const result: any = await exchangeAuthCode(code, client_id, redirect_uri, client_secret);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      access_token: result.token,
      token_type: 'Bearer',
      expires_in: 2592000,
      scope: result.scopes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
  }
}
