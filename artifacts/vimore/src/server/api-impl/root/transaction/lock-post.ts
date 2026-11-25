import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { CREDIT_LIMITS } from '@/lib/credit-pricing';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const postId = String(body.postId || '').trim();
    const rawPrice = Number(body.price ?? body.unlockPrice ?? CREDIT_LIMITS.lockPostMin);

    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 });
    }
    if (!Number.isFinite(rawPrice) || rawPrice < CREDIT_LIMITS.lockPostMin || rawPrice > CREDIT_LIMITS.lockPostMax) {
      return NextResponse.json(
        { error: `Locked post price must be between ${CREDIT_LIMITS.lockPostMin} and ${CREDIT_LIMITS.lockPostMax} Credits` },
        { status: 400 }
      );
    }

    const price = Math.round(rawPrice);
    const db = getAdminDatabases();
    const post = await db.getDocument(DATABASE_ID, COL.POSTS, postId);
    if (post.user_id !== session.authUser.$id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await db.updateDocument(DATABASE_ID, COL.POSTS, postId, {
      is_locked: true,
      unlock_price: price,
    });

    return NextResponse.json({ ok: true, post: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Lock post failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const postId = String(body.postId || req.nextUrl.searchParams.get('postId') || '').trim();
    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const post = await db.getDocument(DATABASE_ID, COL.POSTS, postId);
    if (post.user_id !== session.authUser.$id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await db.updateDocument(DATABASE_ID, COL.POSTS, postId, {
      is_locked: false,
      unlock_price: 0,
    });

    return NextResponse.json({ ok: true, post: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unlock setting update failed' }, { status: 500 });
  }
}
