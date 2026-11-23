import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';

export async function GET(req: NextRequest) {
  try {
    const sellerId = req.nextUrl.searchParams.get('sellerId') || '';
    if (!sellerId) {
      return NextResponse.json({ error: 'sellerId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.MESSAGES, [
      Query.startsWith('cluster_id', `mkt_${sellerId}_`),
      Query.orderDesc('$createdAt'),
      Query.limit(200),
    ]);

    const byCluster = new Map<string, any>();
    for (const msg of res.documents) {
      const cid = String(msg.cluster_id || '');
      if (!cid || byCluster.has(cid)) continue;
      const prefix = `mkt_${sellerId}_`;
      const buyerId = cid.startsWith(prefix) ? cid.slice(prefix.length) : msg.sender_id;
      byCluster.set(cid, {
        clusterId: cid,
        productId: msg.product_id || null,
        buyerId,
        senderName:
          msg.sender_id === sellerId ? msg.receiver_name || 'Buyer' : msg.sender_name || 'Buyer',
        lastMessage:
          msg.text ||
          (msg.type === 'voice' ? 'Voice message' : msg.type === 'photo' ? 'Photo' : 'Attachment'),
        lastTime: msg.$createdAt,
        isRead: Boolean(msg.is_read) || msg.sender_id === sellerId,
        type: msg.type || 'text',
      });
    }

    return NextResponse.json({ conversations: Array.from(byCluster.values()) });
  } catch (err: any) {
    return NextResponse.json({ conversations: [], error: err?.message });
  }
}
