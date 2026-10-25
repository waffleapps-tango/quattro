import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { getProfile } from "@/domain/profile";

afterEach(async () => {
  await cleanupDatabase();
});

describe("getProfile", () => {
  it("returns the member's apartment, building, parking spaces and storage units", async () => {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    await prisma.parkingSpace.create({
      data: { communityId: community.id, apartmentId: apartment.id, number: "P-1", level: "-1", hasEvCharger: true },
    });
    await prisma.storageUnit.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, number: "K-1" },
    });

    const profile = await getProfile(resident, community.id);

    expect(profile.email).toBe(resident.email);
    expect(profile.role).toBe("RESIDENT");
    expect(profile.community.name).toBe(community.name);
    expect(profile.building?.name).toBe("Building A");
    expect(profile.apartments).toEqual([
      expect.objectContaining({ id: apartment.id, number: "101", floor: null, building: { name: "Building A", address: null } }),
    ]);
    expect(profile.parkingSpaces.map((s) => [s.number, s.level, s.hasEvCharger])).toEqual([["P-1", "-1", true]]);
    expect(profile.storageUnits.map((u) => u.number)).toEqual(["K-1"]);
  });

  it("never includes another apartment's spaces and units", async () => {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const other = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    await prisma.parkingSpace.create({ data: { communityId: community.id, apartmentId: other.id, number: "P-9" } });
    await prisma.storageUnit.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: other.id, number: "K-9" },
    });

    const profile = await getProfile(resident, community.id);

    expect(profile.parkingSpaces).toEqual([]);
    expect(profile.storageUnits).toEqual([]);
  });

  it("returns no apartments and empty lists for staff without an apartment", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });

    const profile = await getProfile(manager, community.id);

    expect(profile.apartments).toEqual([]);
    expect(profile.building).toBeNull();
    expect(profile.parkingSpaces).toEqual([]);
    expect(profile.storageUnits).toEqual([]);
  });

  it("returns the building of every apartment the member lives in", async () => {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const second = await prisma.apartment.create({ data: { buildingId: building.id, number: "102", floor: 2 } });
    const resident = await createUserWithMembership({
      communityId: community.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const residency = await prisma.apartmentResidency.create({
      data: { kind: "OWNER", userId: resident.id, apartmentId: second.id, communityId: community.id },
    });

    const profile = await getProfile(
      { ...resident, residencies: [...resident.residencies, residency] },
      community.id,
    );

    expect(profile.apartments.map((a) => [a.number, a.building.name])).toEqual([
      ["101", "Building A"],
      ["102", "Building A"],
    ]);
    expect(profile.building).toBeNull();
  });

  it("rejects an actor from another community", async () => {
    const a = await createCommunityWithBuildingAndApartment();
    const b = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: b.community.id, role: Role.MANAGER });

    await expect(getProfile(outsider, a.community.id)).rejects.toThrow(UnauthorizedError);
  });
});

describe("getProfile people", () => {
  async function rented() {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const common = { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, role: Role.RESIDENT };
    const owner = await createUserWithMembership({ ...common, kind: "OWNER", email: "owner@example.com" });
    const tenant = await createUserWithMembership({ ...common, kind: "TENANT", email: "tenant@example.com" });
    await prisma.user.update({ where: { id: tenant.id }, data: { firstName: "Tina", lastName: "Tenant" } });
    return { community, apartment, owner, tenant };
  }

  it("gives an owner the full list with emails and the derived lives-here flags", async () => {
    const { community, apartment, owner } = await rented();

    const profile = await getProfile(owner, community.id);

    const card = profile.apartments.find((a) => a.id === apartment.id)!;
    expect(card.myLink).toMatchObject({ kind: "OWNER", livesHere: false, livesHereOverride: null, receivesPackages: true });
    expect(card.people.map((p) => [p.kind, p.email, p.livesHere, p.isMe])).toEqual([
      ["OWNER", "owner@example.com", false, true],
      ["TENANT", "tenant@example.com", true, false],
    ]);
  });

  it("gives a tenant names and kinds only, with no emails", async () => {
    const { community, apartment, tenant } = await rented();

    const profile = await getProfile(tenant, community.id);

    const card = profile.apartments.find((a) => a.id === apartment.id)!;
    expect(card.myLink).toMatchObject({ kind: "TENANT", livesHere: true });
    expect(card.people.every((p) => p.email === null)).toBe(true);
    expect(card.people.find((p) => p.isMe)?.name).toBe("Tina Tenant");
    expect(card.people.find((p) => !p.isMe)?.name).toBeNull();
  });

  it("marks the primary contact", async () => {
    const { community, apartment, owner, tenant } = await rented();
    await prisma.apartmentResidency.updateMany({ where: { userId: tenant.id }, data: { isPrimary: true } });

    const card = (await getProfile(owner, community.id)).apartments.find((a) => a.id === apartment.id)!;

    expect(card.people.filter((p) => p.isPrimary).map((p) => p.kind)).toEqual(["TENANT"]);
  });
});
