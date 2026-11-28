import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { calculatePlatformFee, CREDIT_USD_RATE } from '@/lib/transaction-fee';
import { listAllDocuments, requireAdminUser } from '@/lib/server-helpers';

const SENDER_FEE_TYPES = new Set(['GIFT_SENT', 'POST_UNLOCK', 'SUBSCRIPTION', 'TRACK_PURCHASE']);
const GOLD_RATE = 0.01;
const DIAMOND_RATE = CREDIT_USD_RATE;
const LD_MULTIPLIER = 190;

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'FINANCIAL']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();

    const [users, transactions] = await Promise.all([
      listAllDocuments(
        db,
        COL.USERS,
        [Query.select(['$id', 'username', 'gold_balance', 'diamond_balance', 'star_balance'])],
        5000
      ),
      listAllDocuments(
        db,
        COL.TRANSACTIONS,
        [Query.select(['$id', 'type', 'amount', 'currency'])],
        10000
      ).catch(() => []),
    ]);

    let totalGold = 0;
    let totalDiamond = 0;
    let totalStar = 0;

    for (const u of users) {
      totalGold += Number(u.gold_balance || 0);
      totalDiamond += Number(u.diamond_balance || 0);
      totalStar += Number(u.star_balance || 0);
    }

    const goldUSD = totalGold * GOLD_RATE;
    const diamondUSD = totalDiamond * DIAMOND_RATE;
    const totalUSD = goldUSD + diamondUSD;
    const totalLRD = totalUSD * LD_MULTIPLIER;

    let pfGold = 0;
    let pfDiamond = 0;

    for (const tx of transactions) {
      if (!SENDER_FEE_TYPES.has(String(tx.type || ''))) continue;
      const cut = calculatePlatformFee(Number(tx.amount || 0));
      if (tx.currency === 'GOLD') pfGold += cut;
      else if (tx.currency === 'DIAMOND' || tx.currency === 'CREDIT') pfDiamond += cut;
    }

    const platformFeesUSD = pfGold * GOLD_RATE + pfDiamond * DIAMOND_RATE;
    const platformFeesLRD = platformFeesUSD * LD_MULTIPLIER;

    const topHolders = users
      .map((u: any) => {
        const gold = Number(u.gold_balance || 0);
        const diamond = Number(u.diamond_balance || 0);
        return {
          username: u.username || 'unknown',
          gold,
          diamond,
          usd: gold * GOLD_RATE + diamond * DIAMOND_RATE,
        };
      })
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 20);

    return NextResponse.json({
      totalUsers: users.length,
      totalGold,
      totalDiamond,
      totalStar,
      goldUSD,
      diamondUSD,
      totalUSD,
      totalLRD,
      platformFeesUSD,
      platformFeesLRD,
      topHolders,
      snapshotTime: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to compute treasury data' }, { status: 500 });
  }
}
