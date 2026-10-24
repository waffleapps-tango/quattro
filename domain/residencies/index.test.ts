import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { NotFoundError, TenantMismatchError, UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { removeMembership } from "@/domain/memberships";
import { addResidency, listResidentApartments, removeResidency } from "@/domain/residencies";

afterEach(async () => {
  await cleanupDatabase();
});

async function setup() {
  const base = await createCommunityWithBuildingAndApartment();
  const manager = await createUserWithMembership({ communityId: base.community.id, role: Role.MANAGER });
  return { ...base, manager };
}

describe("addResidency", () => {
  it("creates the user, a RESIDENT membership and the residency, with an audit entry", async () => {
    const { community, building, apartment, manager } = await setup();

    const residency = await addResidency(manager, {
      communityId: community.id,
      email: "new@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    expect(residency.apartmentId).toBe(apartment.id);
    expect(residency.communityId).toBe(community.id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "new@example.com" },
      include: { memberships: true },
    });
    expect(user.memberships).toHaveLength(1);
    expect(user.memberships[0].role).toBe(Role.RESIDENT);
    expect(user.memberships[0].apartmentId).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "RESIDENCY_ADDED", entityId: residency.id } })).toBe(1);
  });

  it("reuses an existing membership and keeps its role", async () => {
    const { community, building, apartment, manager } = await setup();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      role: Role.RECEPTIONIST,
      email: "desk@example.com",
    });

    await addResidency(manager, {
      communityId: community.id,
      email: "desk@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    const memberships = await prisma.membership.findMany({ where: { userId: receptionist.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe(Role.RECEPTIONIST);
    expect(await prisma.apartmentResidency.count({ where: { userId: receptionist.id } })).toBe(1);
  });

  it("links the same person to a second apartment", async () => {
    const { community, building, apartment, manager } = await setup();
    const second = await prisma.apartment.create({ data: { buildingId: building.id, number: "102" } });
    const input = { communityId: community.id, email: "owner@example.com", buildingId: building.id };

    await addResidency(manager, { ...input, apartmentId: apartment.id });
    await addResidency(manager, { ...input, apartmentId: second.id });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "owner@example.com" },
      include: { memberships: true, residencies: true },
    });
    expect(user.memberships).toHaveLength(1);
    expect(user.residencies.map((r) => r.apartmentId).sort()).toEqual([apartment.id, second.id].sort());
  });

  it("rejects linking the same person to the same apartment twice", async () => {
    const { community, building, apartment, manager } = await setup();
    const input = {
      communityId: community.id,
      email: "dup@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    };
    await addResidency(manager, input);
    await expect(addResidency(manager, input)).rejects.toThrow(ValidationError);
  });

  it("rejects an apartment that is not in the given building and community", async () => {
    const { community, manager } = await setup();
    const other = await createCommunityWithBuildingAndApartment();

    await expect(
      addResidency(manager, {
        communityId: community.id,
        email: "x@example.com",
        buildingId: other.building.id,
        apartmentId: other.apartment.id,
      }),
    ).rejects.toThrow(TenantMismatchError);
    expect(await prisma.apartmentResidency.count()).toBe(0);
  });

  it("rejects a manager of another community", async () => {
    const { community, building, apartment } = await setup();
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });

    await expect(
      addResidency(outsider, {
        communityId: community.id,
        email: "x@example.com",
        buildingId: building.id,
        apartmentId: apartment.id,
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects residents and receptionists", async () => {
    const { community, building, apartment } = await setup();
    for (const role of [Role.RESIDENT, Role.RECEPTIONIST]) {
      const actor = await createUserWithMembership({ communityId: community.id, role });
      await expect(
        addResidency(actor, {
          communityId: community.id,
          email: "x@example.com",
          buildingId: building.id,
          apartmentId: apartment.id,
        }),
      ).rejects.toThrow(UnauthorizedError);
    }
  });
});

describe("removeResidency", () => {
  it("deletes the residency, keeps the membership and writes an audit entry", async () => {
    const { community, building, apartment, manager } = await setup();
    const residency = await addResidency(manager, {
      communityId: community.id,
      email: "gone@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    await removeResidency(manager, residency.id);

    expect(await prisma.apartmentResidency.count()).toBe(0);
    expect(await prisma.membership.count({ where: { user: { email: "gone@example.com" } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "RESIDENCY_REMOVED", entityId: residency.id } })).toBe(1);
  });

  it("throws NotFoundError for an unknown id and UnauthorizedError for another community's manager", async () => {
    const { community, building, apartment, manager } = await setup();
    const residency = await addResidency(manager, {
      communityId: community.id,
      email: "keep@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });

    await expect(removeResidency(manager, "missing")).rejects.toThrow(NotFoundError);
    await expect(removeResidency(outsider, residency.id)).rejects.toThrow(UnauthorizedError);
    expect(await prisma.apartmentResidency.count()).toBe(1);
  });
});

describe("removeMembership", () => {
  it("also deletes the user's residencies in that community", async () => {
    const { community, building, apartment, manager } = await setup();
    await addResidency(manager, {
      communityId: community.id,
      email: "leaving@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });
    const membership = await prisma.membership.findFirstOrThrow({ where: { user: { email: "leaving@example.com" } } });

    await removeMembership(manager, membership.id);

    expect(await prisma.apartmentResidency.count()).toBe(0);
  });
});

describe("listResidentApartments", () => {
  it("returns only the user's apartments in that community, with their building", async () => {
    const { community, building, apartment } = await setup();
    const second = await prisma.apartment.create({ data: { buildingId: building.id, number: "102" } });
    await prisma.apartment.create({ data: { buildingId: building.id, number: "103" } });
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const residency = await prisma.apartmentResidency.create({
      data: { userId: resident.id, apartmentId: second.id, communityId: community.id },
    });
    const actor = { ...resident, residencies: [...resident.residencies, residency] };

    const apartments = await listResidentApartments(actor, community.id);

    expect(apartments.map((a) => a.number)).toEqual(["101", "102"]);
    expect(apartments[0].building.name).toBe("Building A");
    expect(await listResidentApartments(actor, "other-community")).toEqual([]);
  });
});
