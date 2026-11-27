import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getUserProfile } from '@/lib/oauth-server';
import { getFileUrl, BUCKET } from '@/lib/appwrite';
import { getAdminUsers } from '@/lib/appwrite-server';

const USERINFO_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: USERINFO_CORS_HEADERS });
}

function getBaseOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}

async function handleUserInfo(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: USERINFO_CORS_HEADERS });
    }

    const verified = await verifyAccessToken(token);
    if (!verified) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401, headers: USERINFO_CORS_HEADERS });
    }

    const profile: any = await getUserProfile(verified.user_id);
    if (!profile) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404, headers: USERINFO_CORS_HEADERS });
    }

    const scopes = new Set(String(verified.scopes || '').split(' ').filter(Boolean));
    const origin = getBaseOrigin(req);
    let picture = '';
    if (profile.avatar_id) {
      const rel = getFileUrl(BUCKET.AVATARS, profile.avatar_id);
      picture = rel.startsWith('http') ? rel : `${origin}${rel}`;
    } else if (typeof profile.avatar === 'string' && profile.avatar) {
      picture = profile.avatar.startsWith('http') ? profile.avatar : `${origin}${profile.avatar}`;
    }

    const payload: Record<string, any> = {
      sub: verified.user_id,
      name: profile.name || profile.display_name || '',
      username: profile.username || '',
      picture,
      verified: Boolean(profile.is_verified),
    };

    if (scopes.has('email')) {
      let email = profile.email || '';
      if (!email) {
        try {
          const authUser = await getAdminUsers().get(verified.user_id);
          email = authUser.email || '';
        } catch {}
      }
      if (email) {
        payload.email = email;
      }
    }

    return NextResponse.json(payload, { headers: USERINFO_CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'userinfo_error' },
      { status: 500, headers: USERINFO_CORS_HEADERS }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleUserInfo(req);
}

export async function POST(req: NextRequest) {
  return handleUserInfo(req);
}
