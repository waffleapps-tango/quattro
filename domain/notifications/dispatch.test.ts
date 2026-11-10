import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { dispatchPending, MAX_ATTEMPTS } from "@/domain/notifications/dispatch";
import type { ChannelAdapter, SendResult } from "@/domain/notifications/channels/types";

afterEach(async () => {
  await cleanupDatabase();
});

async function pendingDelivery(channel = "fake", extra: { attempts?: number; nextAttemptAt?: Date } = {}) {
  const { community, resident } = await createPackageScenario();
  const notification = await prisma.notification.create({
    data: {
      communityId: community.id,
      recipientUserId: resident.id,
      type: "PACKAGE_RECEIVED",
      payload: { packageId: "p", buildingName: "B", apartmentNumber: "1" },
    },
  });
  return prisma.notificationDelivery.create({
    data: { notificationId: notification.id, channel, status: "PENDING", ...extra },
  });
}

const fake = (result: SendResult | Error): Record<string, ChannelAdapter> => ({
  fake: {
    id: "fake",
    send: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  },
});

describe("dispatchPending", () => {
  it("marks a successful delivery SENT", async () => {
    const d = await pendingDelivery();
    const result = await dispatchPending(fake({ status: "ok" }));

    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("SENT");
    expect(row.sentAt).not.toBeNull();
    expect(row.attempts).toBe(1);
  });

  it("keeps a retryable delivery PENDING with a future nextAttemptAt", async () => {
    const d = await pendingDelivery();
    const now = new Date();
    const result = await dispatchPending(fake({ status: "retry", error: "timeout" }), now);

    expect(result.retried).toBe(1);
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("PENDING");
    expect(row.lastError).toBe("timeout");
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("treats a thrown adapter error as a retry", async () => {
    const d = await pendingDelivery();
    await dispatchPending(fake(new Error("boom")));
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("PENDING");
    expect(row.lastError).toContain("boom");
  });

  it("re-claims a delivery whose lease expired and skips one still leased", async () => {
    const now = new Date();
    const expired = await pendingDelivery("fake", { attempts: 1, nextAttemptAt: new Date(now.getTime() - 60_000) });
    const leased = await pendingDelivery("fake", { attempts: 1, nextAttemptAt: new Date(now.getTime() + 60_000) });

    const result = await dispatchPending(fake({ status: "ok" }), now);

    expect(result.sent).toBe(1);
    const a = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: expired.id } });
    expect([a.status, a.attempts]).toEqual(["SENT", 2]);
    const b = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: leased.id } });
    expect([b.status, b.attempts]).toEqual(["PENDING", 1]);
  });

  it("fails a delivery after MAX_ATTEMPTS retries", async () => {
    const d = await pendingDelivery("fake", { attempts: MAX_ATTEMPTS - 1 });
    const result = await dispatchPending(fake({ status: "retry", error: "still down" }));

    expect(result.failed).toBe(1);
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("FAILED");
  });

  it("fails immediately on a permanent failure and on an unknown channel", async () => {
    const a = await pendingDelivery();
    await dispatchPending(fake({ status: "fail", error: "bad address" }));
    expect((await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("FAILED");

    await cleanupDatabase();
    const b = await pendingDelivery("nope");
    await dispatchPending(fake({ status: "ok" }));
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("nope");
  });

  it("skips deliveries scheduled for later", async () => {
    const d = await pendingDelivery("fake", { nextAttemptAt: new Date(Date.now() + 60_000) });
    const result = await dispatchPending(fake({ status: "ok" }));

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect((await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("PENDING");
  });
});

describe("dispatchPending concurrency", () => {
  it("sends a delivery once when two dispatchers run at the same time", async () => {
    await pendingDelivery();
    let calls = 0;
    const adapters: Record<string, ChannelAdapter> = {
      fake: {
        id: "fake",
        send: async () => {
          calls++;
          await new Promise((r) => setTimeout(r, 50));
          return { status: "ok" };
        },
      },
    };

    await Promise.all([dispatchPending(adapters), dispatchPending(adapters)]);

    expect(calls).toBe(1);
    expect((await prisma.notificationDelivery.findFirstOrThrow()).status).toBe("SENT");
  });
});
