import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createPackageScenario,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import {
  canEditNotificationSettings,
  getReminderAfterDays,
  updateReminderAfterDays,
} from "@/domain/notifications/settings";

afterEach(async () => {
  await cleanupDatabase();
});

describe("canEditNotificationSettings", () => {
  it("allows MANAGER and ADMIN only", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const check = async (role: Role) =>
      canEditNotificationSettings((await createUserWithMembership({ communityId: community.id, role })).memberships[0]);

    expect(await check(Role.MANAGER)).toBe(true);
    expect(await check(Role.ADMIN)).toBe(true);
    expect(await check(Role.RECEPTIONIST)).toBe(false);
    expect(await check(Role.RESIDENT)).toBe(false);
  });
});

describe("updateReminderAfterDays", () => {
  it("lets a manager set and clear the threshold and writes audit entries", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });

    expect(await getReminderAfterDays(community.id)).toBeNull();
    await updateReminderAfterDays(manager, community.id, 5);
    expect(await getReminderAfterDays(community.id)).toBe(5);
    await updateReminderAfterDays(manager, community.id, null);
    expect(await getReminderAfterDays(community.id)).toBeNull();

    expect(await prisma.auditLog.count({ where: { action: "COMMUNITY_SETTINGS_CHANGED" } })).toBe(2);
  });

  it("rejects reception and residents", async () => {
    const s = await createPackageScenario();
    await expect(updateReminderAfterDays(s.receptionist, s.community.id, 3)).rejects.toThrow(UnauthorizedError);
    await expect(updateReminderAfterDays(s.resident, s.community.id, 3)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a manager of a different community", async () => {
    const a = await createCommunityWithBuildingAndApartment();
    const b = await createCommunityWithBuildingAndApartment();
    const managerOfA = await createUserWithMembership({ communityId: a.community.id, role: Role.MANAGER });

    await expect(updateReminderAfterDays(managerOfA, b.community.id, 3)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects values outside 1-60 or non-integers", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });

    for (const bad of [0, 61, -1, 1.5]) {
      await expect(updateReminderAfterDays(manager, community.id, bad)).rejects.toThrow(ValidationError);
    }
  });
});
