import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';

const SEVERE_PATTERNS = [
  /\b(csam|child\s*porn|kill\s*yourself|suicide\s*how\s*to)\b/i,
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const docId = String(body.docId || '').trim();
    const collection = String(body.collection || '').trim();
    const text = String(body.text || '').trim();
    const userId = String(body.userId || '').trim();

    if (!text) {
      return NextResponse.json({ ok: true, flagged: false });
    }

    const matched = SEVERE_PATTERNS.some((re) => re.test(text));
    if (matched) {
      const nowIso = new Date().toISOString();
      try {
        const db = getAdminDatabases();
        await db.createDocument(DATABASE_ID, COL.ADMIN_REPORTS, ID.unique(), {
          doc_id: docId || 'unknown',
          collection_name: collection || COL.POSTS,
          target_id: docId || 'unknown',
          target_collection: collection || COL.POSTS,
          user_id: userId || 'unknown',
          reason: 'Automated Content Shield Flag',
          severity: 'high',
          content_preview: text.slice(0, 500),
          excerpt: text.slice(0, 500),
          status: 'open',
          reported_at: nowIso,
          created_at: nowIso,
        });
      } catch {
        // non-fatal
      }
      return NextResponse.json({ ok: true, flagged: true, reason: 'policy_violation' });
    }

    return NextResponse.json({ ok: true, flagged: false });
  } catch (err: any) {
    return NextResponse.json({ ok: true, flagged: false, error: err?.message });
  }
}
