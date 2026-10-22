import prisma from "@/lib/prisma";
import { channels } from "./channels";
import type { ChannelAdapter, SendResult } from "./channels/types";

export const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;

// ponytail: only runs from the daily cron (vercel.json `0 8 * * *`), so non-instant
// channels deliver up to 24h late; call it after createPackage via next/server
// `after()` or add a more frequent cron when a real channel ships. It also has no
// claim/lock, so overlapping runs can double-send; add FOR UPDATE SKIP LOCKED or
// a claim column before a second channel ships.
export async function dispatchPending(
  adapters: Record<string, ChannelAdapter> = channels,
  now = new Date(),
) {
  const due = await prisma.notificationDelivery.findMany({
    where: {
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    include: { notification: { include: { recipient: true } } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  const counts = { sent: 0, retried: 0, failed: 0 };

  for (const delivery of due) {
    const adapter = adapters[delivery.channel];
    const attempts = delivery.attempts + 1;
    let result: SendResult;
    if (!adapter) {
      result = { status: "fail", error: `Unknown channel ${delivery.channel}` };
    } else {
      try {
        result = await adapter.send(delivery.notification, delivery.notification.recipient);
      } catch (error) {
        result = { status: "retry", error: String(error) };
      }
    }

    if (result.status === "ok") {
      counts.sent++;
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", sentAt: now, attempts, lastError: null, nextAttemptAt: null },
      });
    } else if (result.status === "retry" && attempts < MAX_ATTEMPTS) {
      counts.retried++;
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          lastError: result.error,
          // Exponential backoff: 2, 4, 8, 16 minutes.
          nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60_000),
        },
      });
    } else {
      counts.failed++;
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attempts, lastError: result.error },
      });
    }
  }

  return counts;
}
