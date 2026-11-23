import { NextRequest, NextResponse } from 'next/server';
import { ID } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile, getUserBalance } from '@/lib/server-helpers';

const COST_PER_DAY = 50;

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const businessName = String(body.businessName || '').trim();
    const details = String(body.details || '').trim();
    const actionUrl = String(body.actionUrl || '').trim();
    const actionLabel = String(body.actionLabel || 'Learn More').trim();
    const placement = body.placement === 'reels' ? 'reels' : 'feed';
    const days = Math.max(1, Math.floor(Number(body.days || 1)));
    const mediaUrl = String(body.mediaUrl || '').trim();
    const mediaId = String(body.mediaId || '').trim();
    const contactType = String(body.contactType || 'url').trim();

    if (!businessName || !details || !mediaUrl) {
      return NextResponse.json({ error: 'Missing required campaign fields' }, { status: 400 });
    }

    const cost = days * COST_PER_DAY;
    const current = getUserBalance(session.profileDoc);

    if (current < cost) {
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_BALANCE',
          current,
          required: cost,
          message: `You need ${cost} Credits for a ${days}-day campaign, but your current balance is ${current} Credits.`,
        },
        { status: 400 }
      );
    }

    const db = getAdminDatabases();
    const newBalance = current - cost;
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
      credit_balance: newBalance,
      diamond_balance: newBalance,
    });

    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const campaign = await db.createDocument(DATABASE_ID, COL.AD_CAMPAIGNS, ID.unique(), {
      user_id: session.authUser.$id,
      username: session.profileDoc.username || '',
      business_name: businessName,
      details,
      action_url: actionUrl,
      action_label: actionLabel,
      placement,
      days,
      cost,
      media_url: mediaUrl,
      media_id: mediaId,
      contact_type: contactType,
      status: 'ACTIVE',
      expires_at: expiresAt,
    });

    return NextResponse.json({ ok: true, campaign, newBalance });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Ad submission failed' }, { status: 500 });
  }
}
