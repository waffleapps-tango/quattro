import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { updateCommentModeration, updateUnregisteredDays } from "@/domain/communities/settings";

afterEach(async () => {
  await cleanupDatabase();
});

const load = (id: string) => prisma.community.findUniqueOrThrow({ where: { id } });

describe("updateUnregisteredDays", () => {
  it("lets a manager set it and audits it", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });
    await updateUnregisteredDays(manager, community.id, 30);
    expect((await load(community.id)).unregisteredDays).toBe(30);
    expect(await prisma.auditLog.count({ where: { communityId: community.id, action: "COMMUNITY_SETTINGS_CHANGED" } })).toBe(1);
  });

  it("rejects residents and receptionists", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    for (const role of [Role.RESIDENT, Role.RECEPTIONIST]) {
      const user = await createUserWithMembership({ communityId: community.id, role });
      await expect(updateUnregisteredDays(user, community.id, 5)).rejects.toBeInstanceOf(UnauthorizedError);
    }
  });

  it("rejects out-of-range and non-integer values", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({ communityId: community.id, role: Role.ADMIN });
    for (const bad of [0, 366, 1.5, NaN]) {
      await expect(updateUnregisteredDays(admin, community.id, bad)).rejects.toBeInstanceOf(ValidationError);
    }
    await updateUnregisteredDays(admin, community.id, 365);
  });
});

describe("updateCommentModeration", () => {
  it("manager changes the reception flag but not the manager flag", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });
    await updateCommentModeration(manager, community.id, { receptionCanHideComments: true });
    expect((await load(community.id)).receptionCanHideComments).toBe(true);
    await expect(
      updateCommentModeration(manager, community.id, { managerCanHideComments: true }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect((await load(community.id)).managerCanHideComments).toBe(false);
  });

  it("admin changes both and it is audited", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({ communityId: community.id, role: Role.ADMIN });
    await updateCommentModeration(admin, community.id, { receptionCanHideComments: true, managerCanHideComments: true });
    const c = await load(community.id);
    expect([c.receptionCanHideComments, c.managerCanHideComments]).toEqual([true, true]);
    expect(await prisma.auditLog.count({ where: { communityId: community.id } })).toBe(1);
  });

  it("rejects residents and receptionists", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    for (const role of [Role.RESIDENT, Role.RECEPTIONIST]) {
      const user = await createUserWithMembership({ communityId: community.id, role });
      await expect(
        updateCommentModeration(user, community.id, { receptionCanHideComments: true }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    }
  });
});
