import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import { calculatePlatformFee } from '@/lib/transaction-fee';
import {
  createAuditEntry,
  getClientIp,
  listAllDocuments,
  logSecurityEvent,
  requireAdminUser,
} from '@/lib/server-helpers';

const FEE_SPLIT_TYPES = new Set(['GIFT_SENT', 'POST_UNLOCK', 'SUBSCRIPTION', 'TRACK_PURCHASE']);

const CATEGORIES: Record<string, { label: string; types: string[]; isFromCampaigns?: boolean }> = {
  gifts: { label: 'Revenue from Gifts', types: ['GIFT_SENT'] },
  unlocks: { label: 'Revenue from Post Unlocks', types: ['POST_UNLOCK'] },
  subscriptions: { label: 'Revenue from Subscriptions', types: ['SUBSCRIPTION'] },
  boosts: { label: 'Revenue from Boost Posts', types: ['BOOST', 'POST_BOOST', 'SONIC_BOOST'] },
  marketplace: { label: 'Revenue from Marketplace', types: ['MARKETPLACE_BOOST', 'STORE_BOOST', 'MARKETPLACE'] },
  songs: { label: 'Revenue from Songs', types: ['TRACK_PURCHASE', 'SONG_REVENUE'] },
  campaigns: { label: 'Revenue from Ad Campaigns', types: [], isFromCampaigns: true },
};

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'FINANCIAL']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();
    const [allUsers, allTransactions, allCampaigns] = await Promise.all([
      listAllDocuments(db, COL.USERS, [Query.select(['$id', 'gold_balance', 'diamond_balance'])], 5000),
      listAllDocuments(db, COL.TRANSACTIONS, [Query.select(['$id', 'type', 'amount'])], 10000).catch(() => []),
      listAllDocuments(db, COL.AD_CAMPAIGNS, [Query.select(['$id', 'budget'])], 2000).catch(() => []),
    ]);

    let totalGold = 0;
    let totalDiamond = 0;
    for (const u of allUsers) {
      totalGold += Number(u.gold_balance || 0);
      totalDiamond += Number(u.diamond_balance || 0);
    }

    const totalsByType = new Map<string, { total: number; count: number }>();
    for (const tx of allTransactions) {
      const type = String(tx.type || '');
      const raw = Number(tx.amount || 0);
      const val = FEE_SPLIT_TYPES.has(type) ? calculatePlatformFee(raw) : raw;
      const entry = totalsByType.get(type) || { total: 0, count: 0 };
      entry.total += val;
      entry.count += 1;
      totalsByType.set(type, entry);
    }

    const campaignRevenue = allCampaigns.reduce((sum: number, c: any) => sum + Number(c.budget || 0), 0);

    const metrics = Object.entries(CATEGORIES).map(([id, cfg]) => {
      if (cfg.isFromCampaigns) {
        return { id, total: Math.round(campaignRevenue * 100) / 100, count: allCampaigns.length };
      }
      let total = 0;
      let count = 0;
      for (const t of cfg.types) {
        const entry = totalsByType.get(t);
        if (entry) {
          total += entry.total;
          count += entry.count;
        }
      }
      return { id, total: Math.round(total * 100) / 100, count };
    });

    return NextResponse.json({
      totalGold,
      totalDiamond,
      userCount: allUsers.length,
      metrics,
      campaignRevenue,
      campaignCount: allCampaigns.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load financial audit' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'FINANCIAL']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const categoryId = String(body.categoryId || '').trim();
    const cfg = CATEGORIES[categoryId];
    if (!cfg) {
      return NextResponse.json({ error: 'Invalid revenue category' }, { status: 400 });
    }

    const db = getAdminDatabases();
    let affected = 0;

    if (cfg.isFromCampaigns) {
      const campaigns = await listAllDocuments(db, COL.AD_CAMPAIGNS, [Query.select(['$id'])], 2000);
      await Promise.all(
        campaigns.map((c: any) =>
          db.updateDocument(DATABASE_ID, COL.AD_CAMPAIGNS, c.$id, { budget: 0 }).then(() => {
            affected += 1;
          })
        )
      );
    } else {
      for (const type of cfg.types) {
        const docs = await listAllDocuments(
          db,
          COL.TRANSACTIONS,
          [Query.equal('type', type), Query.select(['$id'])],
          5000
        );
        const BATCH = 25;
        for (let i = 0; i < docs.length; i += BATCH) {
          const chunk = docs.slice(i, i + BATCH);
          await Promise.all(
            chunk.map((d: any) =>
              db.deleteDocument(DATABASE_ID, COL.TRANSACTIONS, d.$id).then(() => {
                affected += 1;
              })
            )
          );
        }
      }
    }

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);

    await Promise.allSettled([
      createAuditEntry({
        action: 'FINANCIAL_AUDIT_RESET',
        details: `Revenue "${cfg.label}" reset by ${adminName} (@${adminUsername}). ${affected} record(s) affected.`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
      logSecurityEvent({
        event_type: 'FINANCIAL_AUDIT_RESET',
        severity: 'CRITICAL',
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        result: 'success',
        endpoint: '/api/admin/financial-audit',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `${adminName} (@${adminUsername}) reset ${cfg.label} (${affected} records)`,
      }),
    ]);

    return NextResponse.json({ ok: true, affected, label: cfg.label });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Reset failed' }, { status: 500 });
  }
}
