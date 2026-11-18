import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const db = getAdminDatabases();
  const result = await db.listDocuments(DATABASE_ID, 'transactions', [
    Query.equal('user_id', session.userId),
    Query.equal('status', 'completed'),
    Query.limit(500),
  ]);
  const earnings = {
    userId: session.userId,
    totalEarningsCredits: 0,
    giftsEarningsCredits: 0,
    subscriptionsEarningsCredits: 0,
    lockedPostsEarningsCredits: 0,
    lockedMusicEarningsCredits: 0,
    lastUpdated: new Date().toISOString(),
  };
  for (const transaction of result.documents) {
    const credits = Number(transaction.amountCredits || 0);
    if (transaction.currency !== 'CREDIT' || !Number.isFinite(credits)) continue;
    earnings.totalEarningsCredits += credits;
    if (transaction.transactionType === 'gift') earnings.giftsEarningsCredits += credits;
    if (transaction.transactionType === 'subscription') earnings.subscriptionsEarningsCredits += credits;
    if (transaction.transactionType === 'unlock_post') earnings.lockedPostsEarningsCredits += credits;
    if (transaction.transactionType === 'unlock_music') earnings.lockedMusicEarningsCredits += credits;
  }
  for (const key of [
    'totalEarningsCredits',
    'giftsEarningsCredits',
    'subscriptionsEarningsCredits',
    'lockedPostsEarningsCredits',
    'lockedMusicEarningsCredits',
  ] as const) earnings[key] = Math.round(earnings[key] * 100) / 100;
  return NextResponse.json({ earnings });
}