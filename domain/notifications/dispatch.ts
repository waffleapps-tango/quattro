import prisma from "@/lib/prisma";
import { channels } from "./channels";
import type { ChannelAdapter, SendResult } from "./channels/types";

export const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;
const LEASE_MS = 5 * 60_000;

// Runs from the daily cron (retry sweeper) and right after requests via after().
// Each delivery is claimed with an optimistic bump of `attempts`, so overlapping runs
// cannot double-send; the claim also leases it (nextAttemptAt = now + 5min) so a run
// that starts after the claim skips it. A crash between claim and result leaves it
// PENDING, retried once the lease expires (at-least-once).
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
    const attempts = delivery.attempts + 1;
    const claimed = await prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, status: "PENDING", attempts: delivery.attempts },
      data: { attempts, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (claimed.count === 0) continue;
    const adapter = adapters[delivery.channel];
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
