import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/server-helpers';
import { BUCKET, getFileUrl } from '@/lib/appwrite';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      const fileId = String(body.fileId || '').trim();
      if (!fileId) {
        return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        fileId,
        url: getFileUrl(BUCKET.VOICE_MESSAGES, fileId),
      });
    }

    return NextResponse.json(
      { error: 'Direct client upload to Appwrite storage is required; pass { fileId }.' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Voice upload handler failed' }, { status: 500 });
  }
}
