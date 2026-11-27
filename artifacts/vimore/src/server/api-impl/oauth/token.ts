import { NextRequest, NextResponse } from 'next/server';
import { exchangeAuthCode } from '@/lib/oauth-server';

const OAUTH_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

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
      return NextResponse.json(
        { error: 'unsupported_grant_type' },
        { status: 400, headers: OAUTH_CORS_HEADERS }
      );
    }

    let client_id = String(params.client_id || '').trim();
    let client_secret = String(params.client_secret || '').trim();

    // RFC 6749 §2.3.1: Support HTTP Basic authentication
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.toLowerCase().startsWith('basic ')) {
      try {
        const decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        if (idx > 0) {
          client_id = client_id || decodeURIComponent(decoded.slice(0, idx));
          client_secret = client_secret || decodeURIComponent(decoded.slice(idx + 1));
        }
      } catch {}
    }

    const code = String(params.code || '').trim();
    const redirect_uri = String(params.redirect_uri || '').trim();

    if (!code || !client_id || !redirect_uri || !client_secret) {
      return NextResponse.json(
        { error: 'invalid_request' },
        { status: 400, headers: OAUTH_CORS_HEADERS }
      );
    }

    const result: any = await exchangeAuthCode(code, client_id, redirect_uri, client_secret);
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: OAUTH_CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        access_token: result.token,
        token_type: 'Bearer',
        expires_in: 2592000,
        scope: result.scopes,
      },
      { headers: OAUTH_CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'server_error' },
      { status: 500, headers: OAUTH_CORS_HEADERS }
    );
  }
}
