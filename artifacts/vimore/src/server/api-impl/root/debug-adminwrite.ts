import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.APPWRITE_API_KEY),
    adminId: admin.authUser.$id,
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.APPWRITE_API_KEY),
  });
}
