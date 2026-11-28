import { NextRequest, NextResponse } from 'next/server';

import * as ActiveUsers from '@/server/api-impl/admin/active-users';
import * as AuditLogs from '@/server/api-impl/admin/audit-logs';
import * as Ban from '@/server/api-impl/admin/ban';
import * as Broadcast from '@/server/api-impl/admin/broadcast';
import * as Campaigns from '@/server/api-impl/admin/campaigns';
import * as Check from '@/server/api-impl/admin/check';
import * as DashboardData from '@/server/api-impl/admin/dashboard-data';
import * as FinancialAudit from '@/server/api-impl/admin/financial-audit';
import * as Login from '@/server/api-impl/admin/login';
import * as ProductsDelete from '@/server/api-impl/admin/products/delete';
import * as Referrals from '@/server/api-impl/admin/referrals';
import * as RestoreUser from '@/server/api-impl/admin/restore-user';
import * as SecurityEvents from '@/server/api-impl/admin/security-events';
import * as Shield from '@/server/api-impl/admin/shield';
import * as Staff from '@/server/api-impl/admin/staff';
import * as SuperOversight from '@/server/api-impl/admin/super-oversight';
import * as Support from '@/server/api-impl/admin/support';
import * as Suspend from '@/server/api-impl/admin/suspend';
import * as SyncCounts from '@/server/api-impl/admin/sync-counts';
import * as TicketsCheck from '@/server/api-impl/admin/tickets-check';
import * as Treasury from '@/server/api-impl/admin/treasury';
import * as UsersWarn from '@/server/api-impl/admin/users/warn';
import * as Verifications from '@/server/api-impl/admin/verifications';
import * as VerifyApprove from '@/server/api-impl/admin/verify-approve';
import * as VerifyReject from '@/server/api-impl/admin/verify-reject';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Handler = Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS', (req: NextRequest) => Promise<Response> | Response>>;

const ROUTES: Record<string, Handler> = {
  'active-users': ActiveUsers,
  'audit-logs': AuditLogs,
  'ban': Ban,
  'broadcast': Broadcast,
  'campaigns': Campaigns,
  'check': Check,
  'dashboard-data': DashboardData,
  'financial-audit': FinancialAudit,
  'login': Login,
  'products/delete': ProductsDelete,
  'referrals': Referrals,
  'restore-user': RestoreUser,
  'security-events': SecurityEvents,
  'shield': Shield,
  'staff': Staff,
  'super-oversight': SuperOversight,
  'support': Support,
  'suspend': Suspend,
  'sync-counts': SyncCounts,
  'tickets-check': TicketsCheck,
  'treasury': Treasury,
  'users/warn': UsersWarn,
  'verifications': Verifications,
  'verify-approve': VerifyApprove,
  'verify-reject': VerifyReject,
};

async function dispatch(req: NextRequest, method: string, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const key = (path || []).join('/');
  const mod = ROUTES[key];
  const fn = mod?.[method as keyof Handler];
  if (!fn) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return fn(req);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, 'GET', ctx);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, 'POST', ctx);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, 'PUT', ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, 'DELETE', ctx);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, 'PATCH', ctx);
}
