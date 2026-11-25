import { NextResponse } from 'next/server';

const GONE_RESPONSE = {
  error: 'Creator Orange Money payout accounts have been removed. Use Credits and the Withdraw form on /earnings.',
};

export async function GET() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}
