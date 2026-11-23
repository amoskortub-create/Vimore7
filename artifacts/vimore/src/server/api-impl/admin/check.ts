import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req);
    if (!admin) {
      return NextResponse.json({ authorized: false }, { status: 401 });
    }
    return NextResponse.json({
      authorized: true,
      role: admin.role,
      userId: admin.authUser.$id,
    });
  } catch {
    return NextResponse.json({ authorized: false }, { status: 500 });
  }
}
