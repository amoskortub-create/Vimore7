import { NextRequest, NextResponse } from 'next/server';
import { BUCKET } from '@/lib/appwrite';
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, getAuthenticatedProfile } from '@/lib/server-helpers';

const ALLOWED_BUCKETS = new Set<string>(Object.values(BUCKET));

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
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

    const outgoing = new FormData();
    outgoing.append('fileId', fileId);
    const filename = (file as File).name || 'upload.bin';
    outgoing.append('file', file, filename);

    const headers: Record<string, string> = {
      'x-appwrite-project': APPWRITE_PROJECT_ID,
      'x-appwrite-key': apiKey,
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
        body: outgoing,
        cache: 'no-store',
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
