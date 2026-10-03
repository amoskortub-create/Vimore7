import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { expireMissedCalls } from "@/server/api-impl/root/calls";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/missed-calls] CRON_SECRET is not configured.");
    return NextResponse.json({ error: "Cron authentication is not configured." }, { status: 503 });
  }

  const authorization = req.headers.get("authorization") || "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(authorization);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await expireMissedCalls();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/missed-calls] failed:", error);
    return NextResponse.json({ error: "Missed-call processing failed." }, { status: 500 });
  }
}
