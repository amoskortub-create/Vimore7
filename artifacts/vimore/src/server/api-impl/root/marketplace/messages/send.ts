import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clusterId = String(body.clusterId || '').trim();
    const senderId = String(body.senderId || '').trim();
    const senderName = String(body.senderName || 'Guest').trim();
    const rawTarget = String(body.sellerId || body.receiverId || '').trim();

    if (!clusterId || !clusterId.startsWith('mkt_') || !senderId) {
      return NextResponse.json({ error: 'clusterId and senderId are required' }, { status: 400 });
    }

    let receiverId = rawTarget;
    if (!receiverId) {
      const parts = clusterId.split('_');
      if (parts.length >= 3) {
        const sId = parts[1];
        const bId = parts.slice(2).join('_');
        receiverId = senderId === sId ? bId : sId;
      }
    }

    const db = getAdminDatabases();
    const doc = await db.createDocument(DATABASE_ID, COL.MESSAGES, ID.unique(), {
      cluster_id: clusterId,
      sender_id: senderId,
      sender_name: senderName,
      receiver_id: receiverId || senderId,
      text: body.text ? String(body.text) : '',
      type: String(body.type || 'text'),
      media_url: body.mediaUrl ? String(body.mediaUrl) : undefined,
      media_id: body.mediaId ? String(body.mediaId) : undefined,
      voice_duration: body.voiceDuration ? String(body.voiceDuration) : undefined,
      is_read: false,
    });

    if (receiverId && !receiverId.startsWith('guest_') && receiverId !== senderId) {
      await safeNotify({
        user_id: receiverId,
        from_user_id: senderId,
        from_user_name: senderName,
        type: 'MESSAGE',
        title: `Marketplace message from ${senderName}`,
        content: body.text ? String(body.text).slice(0, 120) : 'Sent an attachment',
        action_href: '/marketplace',
      });
    }

    return NextResponse.json({ ok: true, message: doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Send failed' }, { status: 500 });
  }
}
