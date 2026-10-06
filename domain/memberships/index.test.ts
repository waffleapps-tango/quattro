import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
} from "@/domain/__test-helpers__/fixtures";
import {
  createMembership,
  listMembershipsForCommunity,
  updateMembershipRole,
  removeMembership,
} from "@/domain/memberships";

afterEach(async () => {
  await cleanupDatabase();
});

describe("createMembership", () => {
  it("creates a membership and an audit log entry when the actor is an admin", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({
      communityId: community.id,
      role: Role.ADMIN,
    });

    const membership = await createMembership(admin, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
      email: "resident@example.com",
    });

    expect(membership.role).toBe(Role.RESIDENT);

    const auditEntries = await prisma.auditLog.findMany({
      where: { entity: "Membership", entityId: membership.id },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe("MEMBERSHIP_CREATED");
  });

  it("rejects a non-admin, non-manager actor", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const resident = await createUserWithMembership({
      communityId: community.id,
      role: Role.RESIDENT,
    });

    await expect(
      createMembership(resident, {
        communityId: community.id,
        role: Role.RESIDENT,
        email: "someone@example.com",
      }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("listMembershipsForCommunity", () => {
  it("only returns memberships for the requested community", async () => {
    const { community: communityA } = await createCommunityWithBuildingAndApartment();
    const { community: communityB } = await createCommunityWithBuildingAndApartment();
    const adminA = await createUserWithMembership({
      communityId: communityA.id,
      role: Role.ADMIN,
    });
    await createUserWithMembership({ communityId: communityB.id, role: Role.RESIDENT });

    const result = await listMembershipsForCommunity(adminA, communityA.id);

    expect(result).toHaveLength(1);
    expect(result[0].communityId).toBe(communityA.id);
  });
});

describe("updateMembershipRole / removeMembership", () => {
  it("updates the role and writes an audit entry", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({
      communityId: community.id,
      role: Role.ADMIN,
    });
    const target = await createUserWithMembership({
      communityId: community.id,
      role: Role.RESIDENT,
    });

    const updated = await updateMembershipRole(
      admin,
      target.memberships[0].id,
      Role.RECEPTIONIST,
    );

    expect(updated.role).toBe(Role.RECEPTIONIST);
    const audit = await prisma.auditLog.findMany({
      where: { entity: "Membership", entityId: target.memberships[0].id, action: "USER_ROLE_CHANGED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("removes the membership and writes an audit entry", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({
      communityId: community.id,
      role: Role.ADMIN,
    });
    const target = await createUserWithMembership({
      communityId: community.id,
      role: Role.RESIDENT,
    });

    await removeMembership(admin, target.memberships[0].id);

    const remaining = await prisma.membership.findUnique({
      where: { id: target.memberships[0].id },
    });
    expect(remaining).toBeNull();
  });
});
