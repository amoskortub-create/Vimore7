import { NextRequest, NextResponse } from 'next/server';
import { revokeAccessToken } from '@/lib/oauth-server';

const REVOKE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: REVOKE_CORS_HEADERS });
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

    const token = String(params.token || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400, headers: REVOKE_CORS_HEADERS });
    }
    await revokeAccessToken(token);
    return NextResponse.json({ ok: true }, { headers: REVOKE_CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Revoke failed' }, { status: 500, headers: REVOKE_CORS_HEADERS });
  }
}
