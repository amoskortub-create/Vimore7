import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/oauth-server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { BUCKET, COL, getFileUrl } from '@/lib/appwrite';
import { Query } from 'node-appwrite';

const POSTS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: POSTS_CORS_HEADERS });
}

function getBaseOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: POSTS_CORS_HEADERS });
    }

    const verified = await verifyAccessToken(token);
    if (!verified) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401, headers: POSTS_CORS_HEADERS });
    }

    const scopes = new Set(String(verified.scopes || '').split(' ').filter(Boolean));
    if (!scopes.has('read:posts')) {
      return NextResponse.json(
        { error: 'insufficient_scope', required_scope: 'read:posts' },
        { status: 403, headers: POSTS_CORS_HEADERS }
      );
    }

    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 20);
    const limit = Math.min(Math.max(1, Number.isFinite(limitParam) ? limitParam : 20), 50);

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.POSTS, [
      Query.equal('user_id', verified.user_id),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
    ]);

    const origin = getBaseOrigin(req);
    const toAbs = (relOrUrl: string) =>
      !relOrUrl ? '' : relOrUrl.startsWith('http') ? relOrUrl : `${origin}${relOrUrl}`;

    const posts = res.documents
      .filter((doc: any) => !doc.is_locked)
      .map((doc: any) => {
        let imageIds: string[] = [];
        try {
          const parsed = typeof doc.image_ids === 'string' ? JSON.parse(doc.image_ids) : doc.image_ids;
          if (Array.isArray(parsed)) imageIds = parsed.filter(Boolean);
        } catch {}

        const media_urls = imageIds.map((id) => toAbs(getFileUrl(BUCKET.POST_MEDIA, id)));
        const video_url = doc.video_id ? toAbs(getFileUrl(BUCKET.REEL_MEDIA, doc.video_id)) : '';

        return {
          id: doc.$id,
          type: doc.type || 'post',
          content: doc.content || '',
          media_urls,
          video_url: video_url || undefined,
          likes_count: Number(doc.likes_count || 0),
          comments_count: Number(doc.comments_count || 0),
          shares_count: Number(doc.shares_count || 0),
          created_at: doc.$createdAt,
        };
      });

    return NextResponse.json({ posts }, { headers: POSTS_CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'posts_error' },
      { status: 500, headers: POSTS_CORS_HEADERS }
    );
  }
}
