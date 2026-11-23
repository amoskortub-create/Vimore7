import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || '').trim();
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const conv = await db.getDocument(DATABASE_ID, COL.AI_CONVERSATIONS, conversationId);
    if (conv.user_id !== session.authUser.$id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const msgs = await db.listDocuments(DATABASE_ID, COL.AI_MESSAGES, [
      Query.equal('conversation_id', conversationId),
      Query.limit(100),
    ]);
    for (const m of msgs.documents) {
      await db.deleteDocument(DATABASE_ID, COL.AI_MESSAGES, m.$id).catch(() => {});
    }

    await db.deleteDocument(DATABASE_ID, COL.AI_CONVERSATIONS, conversationId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
