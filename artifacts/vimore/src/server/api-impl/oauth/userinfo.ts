import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getUserProfile } from '@/lib/oauth-server';
import { getFileUrl, BUCKET } from '@/lib/appwrite';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const verified = await verifyAccessToken(token);
    if (!verified) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }

    const profile: any = await getUserProfile(verified.user_id);
    if (!profile) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    const scopes = new Set(String(verified.scopes || '').split(' ').filter(Boolean));
    const picture = profile.avatar_id ? getFileUrl(BUCKET.AVATARS, profile.avatar_id) : '';

    const payload: Record<string, any> = {
      sub: verified.user_id,
      name: profile.name || '',
      username: profile.username || '',
      picture,
      verified: Boolean(profile.is_verified),
    };

    if (scopes.has('email') && profile.email) {
      payload.email = profile.email;
    }

    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'userinfo_error' }, { status: 500 });
  }
}
