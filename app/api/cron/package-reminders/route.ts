import { NextResponse } from "next/server";
import { dispatchPending } from "@/domain/notifications/dispatch";
import { sendAutoReminders } from "@/domain/packages/reminders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { sent } = await sendAutoReminders();
  const dispatched = await dispatchPending();
  return NextResponse.json({ sent, dispatched });
}
