import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const receiverId = String(body.receiverId || '').trim();
    const clusterId = String(body.clusterId || '').trim();
    const type = String(body.type || 'text');
    const text = body.text ? String(body.text) : '';

    if (!receiverId && !clusterId) {
      return NextResponse.json({ error: 'receiverId or clusterId is required' }, { status: 400 });
    }

    const senderId = session.authUser.$id;
    const senderName = String(session.profileDoc.name || session.profileDoc.username || 'ViMore User');
    const effectiveClusterId =
      clusterId || `dm_${[senderId, receiverId].sort().join('_')}`;

    const db = getAdminDatabases();
    const doc = await db.createDocument(DATABASE_ID, COL.MESSAGES, ID.unique(), {
      cluster_id: effectiveClusterId,
      sender_id: senderId,
      sender_name: senderName,
      receiver_id: receiverId || senderId,
      text,
      type,
      media_url: body.mediaUrl ? String(body.mediaUrl) : undefined,
      media_id: body.mediaId ? String(body.mediaId) : undefined,
      voice_duration: body.voiceDuration ? String(body.voiceDuration) : undefined,
      is_view_once: Boolean(body.isViewOnce),
      is_read: false,
    });

    if (receiverId && receiverId !== senderId) {
      await safeNotify({
        user_id: receiverId,
        from_user_id: senderId,
        from_user_name: senderName,
        from_user_avatar: session.profileDoc.avatar || '',
        type: 'MESSAGE',
        title: `Message from ${senderName}`,
        content: type === 'voice' ? 'Sent a voice message' : text.slice(0, 120) || 'Sent media',
        action_href: '/messages',
      });
    }

    return NextResponse.json({ ok: true, messageId: doc.$id, message: doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Message send failed' }, { status: 500 });
  }
}
