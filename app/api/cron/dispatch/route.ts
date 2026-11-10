import { NextResponse } from "next/server";
import { dispatchPending } from "@/domain/notifications/dispatch";

export const dynamic = "force-dynamic";

// Retry sweeper: the backoff is 2-16 min, so this must run far more often than the daily reminders cron.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ dispatched: await dispatchPending() });
}
