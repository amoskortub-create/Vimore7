import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Direct Orange Money post unlocks have been removed. Use /api/transaction/unlock-post with Credits.' },
    { status: 410 }
  );
}
