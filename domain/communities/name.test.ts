import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { updateCommunityName } from "@/domain/communities/name";

afterEach(async () => {
  await cleanupDatabase();
});

describe("updateCommunityName", () => {
  it("lets a manager rename (trimmed) and audits it", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });

    await updateCommunityName(manager, community.id, "  Osiedle Słoneczne ");

    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).name).toBe("Osiedle Słoneczne");
    expect(await prisma.auditLog.count({ where: { communityId: community.id, action: "COMMUNITY_SETTINGS_CHANGED" } })).toBe(1);
  });

  it("rejects residents and receptionists", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    for (const role of [Role.RESIDENT, Role.RECEPTIONIST]) {
      const user = await createUserWithMembership({ communityId: community.id, role });
      await expect(updateCommunityName(user, community.id, "X")).rejects.toBeInstanceOf(UnauthorizedError);
    }
  });

  it("rejects empty and too-long names", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({ communityId: community.id, role: Role.ADMIN });
    await expect(updateCommunityName(admin, community.id, "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(updateCommunityName(admin, community.id, "x".repeat(61))).rejects.toBeInstanceOf(ValidationError);
  });
});
