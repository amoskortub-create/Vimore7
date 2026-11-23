import { NextRequest, NextResponse } from 'next/server';
import { getLinkPreview } from 'link-preview-js';

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url') || '';
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'Disallowed URL' }, { status: 400 });
  }

  try {
    const preview: any = await getLinkPreview(parsed.toString(), { timeout: 4500 });
    return NextResponse.json({
      url: preview?.url || parsed.toString(),
      title: preview?.title || parsed.hostname,
      description: preview?.description || '',
      images: Array.isArray(preview?.images) ? preview.images.slice(0, 3) : [],
      siteName: preview?.siteName || parsed.hostname,
    });
  } catch {
    return NextResponse.json({
      url: parsed.toString(),
      title: parsed.hostname,
      description: '',
      images: [],
      siteName: parsed.hostname,
    });
  }
}
