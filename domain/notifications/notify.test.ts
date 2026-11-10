import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { notify } from "@/domain/notifications";

afterEach(async () => {
  await cleanupDatabase();
});

const payload = { packageId: "p1", buildingName: "Building A", apartmentNumber: "101" };

describe("notify", () => {
  it("creates one notification and one instant SENT in-app delivery per recipient", async () => {
    const { community, resident, receptionist } = await createPackageScenario();

    const created = await prisma.$transaction((tx) =>
      notify(tx, {
        communityId: community.id,
        type: "PACKAGE_RECEIVED",
        recipientUserIds: [resident.id, receptionist.id],
        payload,
      }),
    );

    expect(created).toHaveLength(2);
    const deliveries = await prisma.notificationDelivery.findMany();
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((d) => d.channel === "in-app" && d.status === "SENT")).toBe(true);
    expect(deliveries.every((d) => d.sentAt !== null)).toBe(true);
  });

  it("skips a recipient that already has the same dedupe key", async () => {
    const { community, resident } = await createPackageScenario();
    const run = () =>
      prisma.$transaction((tx) =>
        notify(tx, {
          communityId: community.id,
          type: "PACKAGE_RECEIVED",
          recipientUserIds: [resident.id],
          payload,
          dedupeKey: "PACKAGE_RECEIVED:p1",
        }),
      );

    expect(await run()).toHaveLength(1);
    expect(await run()).toHaveLength(0);
    expect(await prisma.notification.count()).toBe(1);
  });

  it("deduplicates repeated recipient ids and returns [] for no recipients", async () => {
    const { community, resident } = await createPackageScenario();

    const created = await prisma.$transaction((tx) =>
      notify(tx, {
        communityId: community.id,
        type: "PACKAGE_RECEIVED",
        recipientUserIds: [resident.id, resident.id],
        payload,
      }),
    );
    expect(created).toHaveLength(1);

    const none = await prisma.$transaction((tx) =>
      notify(tx, {
        communityId: community.id,
        type: "PACKAGE_RECEIVED",
        recipientUserIds: [],
        payload,
      }),
    );
    expect(none).toEqual([]);
  });

  it("rejects a payload that does not match the type schema", async () => {
    const { community, resident } = await createPackageScenario();

    await expect(
      prisma.$transaction((tx) =>
        notify(tx, {
          communityId: community.id,
          type: "PACKAGE_REMINDER",
          recipientUserIds: [resident.id],
          // daysWaiting is required for reminders
          payload: payload as never,
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("notify channel resolution", () => {
  const send = (communityId: string, userIds: string[]) =>
    prisma.$transaction((tx) =>
      notify(tx, { communityId, type: "PACKAGE_RECEIVED", recipientUserIds: userIds, payload }),
    );

  it("gives opted-out users only the in-app delivery", async () => {
    const { community, resident } = await createPackageScenario();
    await send(community.id, [resident.id]);
    const channelsUsed = (await prisma.notificationDelivery.findMany()).map((d) => d.channel);
    expect(channelsUsed).toEqual(["in-app"]);
  });

  it("gives only in-app when a preference row exists but all channels are disabled", async () => {
    const { community, resident } = await createPackageScenario();
    await prisma.notificationPreference.create({
      data: { userId: resident.id, emailEnabled: false, smsEnabled: false, phone: "+48123456789" },
    });
    await send(community.id, [resident.id]);
    expect((await prisma.notificationDelivery.findMany()).map((d) => d.channel)).toEqual(["in-app"]);
  });

  it("adds PENDING email and sms deliveries for opted-in users", async () => {
    const { community, resident } = await createPackageScenario();
    await prisma.notificationPreference.create({
      data: { userId: resident.id, emailEnabled: true, smsEnabled: true, phone: "+48123456789" },
    });
    await send(community.id, [resident.id]);
    const deliveries = await prisma.notificationDelivery.findMany({ orderBy: { channel: "asc" } });
    expect(deliveries.map((d) => [d.channel, d.status])).toEqual([
      ["email", "PENDING"],
      ["in-app", "SENT"],
      ["sms", "PENDING"],
    ]);
  });

  it("skips sms when enabled but no phone is stored", async () => {
    const { community, resident } = await createPackageScenario();
    await prisma.notificationPreference.create({
      data: { userId: resident.id, smsEnabled: true, phone: null },
    });
    await send(community.id, [resident.id]);
    expect((await prisma.notificationDelivery.findMany()).map((d) => d.channel)).toEqual(["in-app"]);
  });

  it("resolves channels per recipient", async () => {
    const { community, resident, receptionist } = await createPackageScenario();
    await prisma.notificationPreference.create({
      data: { userId: resident.id, emailEnabled: true },
    });
    await send(community.id, [resident.id, receptionist.id]);
    expect(await prisma.notificationDelivery.count()).toBe(3);
    expect(await prisma.notificationDelivery.count({ where: { channel: "email" } })).toBe(1);
  });
});
