import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Direct Orange Money transaction logging has been removed. Use Credit transaction endpoints.' },
    { status: 410 }
  );
}
