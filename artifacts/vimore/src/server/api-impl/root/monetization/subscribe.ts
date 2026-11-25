import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Direct Orange Money subscriptions have been removed. Use /api/transaction/subscribe with 500 Credits.' },
    { status: 410 }
  );
}
