import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const postId = String(body.postId || '').trim();
    const action = String(body.action || '').trim();
    if (!postId || !['like', 'remove-like', 'unlike', 'remove-unlike'].includes(action)) {
      return NextResponse.json({ error: 'postId and valid action required' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const post = await db.getDocument(DATABASE_ID, COL.POSTS, postId);
    let likesCount = Number(post.likes_count || 0);
    let unlikesCount = Number(post.unlikes_count || 0);

    const existing = await db.listDocuments(DATABASE_ID, COL.POST_REACTIONS, [
      Query.equal('post_id', postId),
      Query.equal('user_id', session.authUser.$id),
      Query.limit(5),
    ]);
    const current = existing.documents[0];

    if (action === 'like') {
      if (!current) {
        await db.createDocument(DATABASE_ID, COL.POST_REACTIONS, ID.unique(), {
          post_id: postId,
          user_id: session.authUser.$id,
          type: 'like',
        });
        likesCount += 1;
      } else if (current.type !== 'like') {
        await db.updateDocument(DATABASE_ID, COL.POST_REACTIONS, current.$id, { type: 'like' });
        likesCount += 1;
        unlikesCount = Math.max(0, unlikesCount - 1);
      }
    } else if (action === 'remove-like') {
      if (current?.type === 'like') {
        await db.deleteDocument(DATABASE_ID, COL.POST_REACTIONS, current.$id);
        likesCount = Math.max(0, likesCount - 1);
      }
    } else if (action === 'unlike') {
      if (!current) {
        await db.createDocument(DATABASE_ID, COL.POST_REACTIONS, ID.unique(), {
          post_id: postId,
          user_id: session.authUser.$id,
          type: 'unlike',
        });
        unlikesCount += 1;
      } else if (current.type !== 'unlike') {
        await db.updateDocument(DATABASE_ID, COL.POST_REACTIONS, current.$id, { type: 'unlike' });
        unlikesCount += 1;
        likesCount = Math.max(0, likesCount - 1);
      }
    } else if (action === 'remove-unlike') {
      if (current?.type === 'unlike') {
        await db.deleteDocument(DATABASE_ID, COL.POST_REACTIONS, current.$id);
        unlikesCount = Math.max(0, unlikesCount - 1);
      }
    }

    await db.updateDocument(DATABASE_ID, COL.POSTS, postId, {
      likes_count: likesCount,
      unlikes_count: unlikesCount,
    });

    return NextResponse.json({ ok: true, likesCount, unlikesCount });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Reaction failed' }, { status: 500 });
  }
}
