import { NextRequest, NextResponse } from 'next/server';
import { BUCKET } from '@/lib/appwrite';
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '@/lib/server-helpers';

const ALLOWED_BUCKETS = new Set<string>(Object.values(BUCKET));
const VALID_FILE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; fileId: string }> }
) {
  const { bucket, fileId } = await ctx.params;

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
  }

  if (!VALID_FILE_ID.test(fileId)) {
    return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
  }

  const apiKey = process.env.APPWRITE_API_KEY || '';
  if (!apiKey) {
    return NextResponse.json({ error: 'Storage proxy not configured' }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const hasPreview =
    sp.has('width') || sp.has('height') || sp.has('quality') || sp.has('output');
  const endpointKind = hasPreview ? 'preview' : 'view';
  const qs = sp.toString();

  const upstreamUrl = `${APPWRITE_ENDPOINT}/storage/buckets/${encodeURIComponent(
    bucket
  )}/files/${encodeURIComponent(fileId)}/${endpointKind}${qs ? `?${qs}` : ''}`;

  try {
    const upstreamHeaders: Record<string, string> = {
      'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      'X-Appwrite-Key': apiKey,
    };
    const range = req.headers.get('range');
    if (range) upstreamHeaders['Range'] = range;

    const upstream = await fetch(upstreamUrl, {
      headers: upstreamHeaders,
      cache: range || !hasPreview ? 'no-store' : 'force-cache',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'File unavailable' },
        { status: upstream.status }
      );
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) headers.set('Content-Range', contentRange);
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'File proxy error' },
      { status: 502 }
    );
  }
}
