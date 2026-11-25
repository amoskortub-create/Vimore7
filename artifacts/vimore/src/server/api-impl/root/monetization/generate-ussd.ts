import { NextResponse } from 'next/server';

const GONE_RESPONSE = {
  error: 'Direct Orange Money transfers to creators have been removed. Please use Credit transactions instead.',
};

export async function POST() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}

export async function GET() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}
