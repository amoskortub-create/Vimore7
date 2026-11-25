import { NextRequest, NextResponse } from 'next/server';
import { BUCKET } from '@/lib/appwrite';
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '@/lib/server-helpers';
import { getSessionUser } from '@/lib/session';

const ALLOWED_BUCKETS = new Set<string>(Object.values(BUCKET));

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.APPWRITE_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ error: 'Storage credentials are not configured.' }, { status: 500 });
    }

    const incoming = await req.formData();
    const bucketId = String(incoming.get('bucketId') || '').trim();
    const fileId = String(incoming.get('fileId') || 'unique()').trim() || 'unique()';
    const file = incoming.get('file');

    if (!ALLOWED_BUCKETS.has(bucketId)) {
      return NextResponse.json({ error: 'Invalid storage bucket.' }, { status: 400 });
    }
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file payload.' }, { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const fileBuf = Buffer.from(arrayBuf);
    if (fileBuf.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file payload.' }, { status: 400 });
    }

    const rawName = ((file as File).name || 'upload.bin').replace(/[\r\n"]/g, '_');
    const mimeType = ((file as File).type || 'application/octet-stream').replace(/[\r\n]/g, '');
    const boundary = `----ViMoreChunk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

    const prefix = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="fileId"\r\n\r\n` +
        `${fileId}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${rawName}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`,
      'utf8'
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const multipartBody = Buffer.concat([prefix, fileBuf, suffix]);

    const headers: Record<string, string> = {
      'x-appwrite-project': APPWRITE_PROJECT_ID,
      'x-appwrite-key': apiKey,
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(multipartBody.byteLength),
    };

    const contentRange = req.headers.get('content-range') || String(incoming.get('contentRange') || '').trim();
    const appwriteId = req.headers.get('x-appwrite-id') || String(incoming.get('appwriteId') || '').trim();
    if (contentRange) headers['content-range'] = contentRange;
    if (appwriteId) headers['x-appwrite-id'] = appwriteId;

    const appwriteRes = await fetch(
      `${APPWRITE_ENDPOINT}/storage/buckets/${encodeURIComponent(bucketId)}/files`,
      {
        method: 'POST',
        headers,
        body: multipartBody,
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000),
      }
    );

    const data = await appwriteRes.json().catch(() => ({}));
    if (!appwriteRes.ok) {
      return NextResponse.json(
        { error: data?.message || `Storage upload failed (${appwriteRes.status})` },
        { status: appwriteRes.status }
      );
    }

    return NextResponse.json(data, { status: appwriteRes.status === 204 ? 200 : appwriteRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Chunk upload failed.' }, { status: 500 });
  }
}
