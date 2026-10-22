import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import {
  InvalidTransitionError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
} from "@/domain/errors";
import {
  cleanupDatabase,
  createPackageScenario,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { createPackage, markPickedUp } from "@/domain/packages";
import { remindPackage, sendAutoReminders } from "@/domain/packages/reminders";

afterEach(async () => {
  await cleanupDatabase();
});

const DAY = 24 * 60 * 60 * 1000;

async function registerPackage(scenario: Awaited<ReturnType<typeof createPackageScenario>>, recipientUserId?: string) {
  return createPackage(scenario.receptionist, {
    communityId: scenario.community.id,
    buildingId: scenario.building.id,
    apartmentId: scenario.apartment.id,
    recipientUserId,
  });
}

describe("PACKAGE_RECEIVED on createPackage", () => {
  it("notifies every resident of the apartment when no recipient is set", async () => {
    const s = await createPackageScenario();
    const roommate = await createUserWithMembership({
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
      role: Role.RESIDENT,
    });

    const pkg = await registerPackage(s);

    const rows = await prisma.notification.findMany({ where: { type: "PACKAGE_RECEIVED" } });
    expect(rows.map((r) => r.recipientUserId).sort()).toEqual([s.resident.id, roommate.id].sort());
    expect(rows[0].payload).toMatchObject({ packageId: pkg.id, apartmentNumber: "101" });
  });

  it("notifies only the named recipient when one is set", async () => {
    const s = await createPackageScenario();
    await createUserWithMembership({
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
      role: Role.RESIDENT,
    });

    await registerPackage(s, s.resident.id);

    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(s.resident.id);
  });

  it("does not notify residents of other apartments or other communities", async () => {
    const s = await createPackageScenario();
    const other = await createPackageScenario();

    await registerPackage(s);

    const rows = await prisma.notification.findMany();
    expect(rows.map((r) => r.recipientUserId)).toEqual([s.resident.id]);
    expect(rows.some((r) => r.recipientUserId === other.resident.id)).toBe(false);
  });

  it("still registers the package when the apartment has no residents", async () => {
    const s = await createPackageScenario();
    await prisma.membership.delete({ where: { id: s.resident.memberships[0].id } });

    const pkg = await registerPackage(s);

    expect(pkg.status).toBe("RECEIVED");
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("remindPackage", () => {
  it("notifies the residents, writes an audit entry and reports the count", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    const now = new Date(pkg.receivedAt.getTime() + 3 * DAY);

    const result = await remindPackage(s.receptionist, pkg.id, now);

    expect(result).toEqual({ notified: 1 });
    const reminder = await prisma.notification.findFirstOrThrow({ where: { type: "PACKAGE_REMINDER" } });
    expect(reminder.recipientUserId).toBe(s.resident.id);
    expect(reminder.payload).toMatchObject({ packageId: pkg.id, daysWaiting: 3 });
    expect(
      await prisma.auditLog.count({ where: { action: "PACKAGE_REMINDER_SENT", entityId: pkg.id } }),
    ).toBe(1);
  });

  it("rejects residents", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    await expect(remindPackage(s.resident, pkg.id)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects an unknown package", async () => {
    const s = await createPackageScenario();
    await expect(remindPackage(s.receptionist, "missing")).rejects.toThrow(NotFoundError);
  });

  it("rejects a package that was already picked up", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    await markPickedUp(s.receptionist, pkg.id);
    await expect(remindPackage(s.receptionist, pkg.id)).rejects.toThrow(InvalidTransitionError);
  });

  it("rate-limits a second reminder within an hour but allows it later", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    const t0 = new Date();

    await remindPackage(s.receptionist, pkg.id, t0);
    await expect(
      remindPackage(s.receptionist, pkg.id, new Date(t0.getTime() + 10 * 60_000)),
    ).rejects.toThrow(RateLimitedError);

    // The cooldown looks at createdAt (real clock), so age the reminder instead.
    await prisma.notification.updateMany({
      where: { type: "PACKAGE_REMINDER" },
      data: { createdAt: new Date(t0.getTime() - 2 * 3_600_000) },
    });
    const later = new Date(t0.getTime() + 2 * 3_600_000);
    await expect(remindPackage(s.receptionist, pkg.id, later)).resolves.toEqual({ notified: 1 });
  });

  it("reports zero when nobody can be notified", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    await prisma.membership.delete({ where: { id: s.resident.memberships[0].id } });

    expect(await remindPackage(s.receptionist, pkg.id)).toEqual({ notified: 0 });
  });
});

describe("sendAutoReminders", () => {
  async function backdate(packageId: string, days: number) {
    await prisma.package.update({
      where: { id: packageId },
      data: { receivedAt: new Date(Date.now() - days * DAY) },
    });
  }

  it("reminds only unpicked packages older than the community threshold", async () => {
    const s = await createPackageScenario();
    await prisma.community.update({ where: { id: s.community.id }, data: { reminderAfterDays: 3 } });
    const old = await registerPackage(s);
    const fresh = await registerPackage(s);
    const picked = await registerPackage(s);
    await backdate(old.id, 4);
    await backdate(picked.id, 10);
    await markPickedUp(s.receptionist, picked.id);

    const result = await sendAutoReminders();

    expect(result).toEqual({ sent: 1 });
    const rows = await prisma.notification.findMany({ where: { type: "PACKAGE_REMINDER_AUTO" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ packageId: old.id, daysWaiting: 4 });
    expect(rows.some((r) => (r.payload as { packageId: string }).packageId === fresh.id)).toBe(false);
  });

  it("sends exactly one automatic reminder per package across reruns", async () => {
    const s = await createPackageScenario();
    await prisma.community.update({ where: { id: s.community.id }, data: { reminderAfterDays: 1 } });
    const pkg = await registerPackage(s);
    await backdate(pkg.id, 2);

    expect((await sendAutoReminders()).sent).toBe(1);
    expect((await sendAutoReminders()).sent).toBe(0);
    expect(await prisma.notification.count({ where: { type: "PACKAGE_REMINDER_AUTO" } })).toBe(1);
  });

  it("skips communities with automatic reminders off", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    await backdate(pkg.id, 30);

    expect(await sendAutoReminders()).toEqual({ sent: 0 });
  });
});
