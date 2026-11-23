import { NextRequest, NextResponse } from 'next/server';
import { revokeAccessToken } from '@/lib/oauth-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }
    await revokeAccessToken(token);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Revoke failed' }, { status: 500 });
  }
}
