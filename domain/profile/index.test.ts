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
    expect(profile.apartment).toEqual({ number: "101", floor: null });
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

  it("returns null apartment and empty lists for staff without an apartment", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });

    const profile = await getProfile(manager, community.id);

    expect(profile.apartment).toBeNull();
    expect(profile.building).toBeNull();
    expect(profile.parkingSpaces).toEqual([]);
    expect(profile.storageUnits).toEqual([]);
  });

  it("falls back to the apartment's building when the membership has none", async () => {
    const { community, apartment } = await createCommunityWithBuildingAndApartment();
    const resident = await createUserWithMembership({
      communityId: community.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });

    const profile = await getProfile(resident, community.id);

    expect(profile.building?.name).toBe("Building A");
  });

  it("rejects an actor from another community", async () => {
    const a = await createCommunityWithBuildingAndApartment();
    const b = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: b.community.id, role: Role.MANAGER });

    await expect(getProfile(outsider, a.community.id)).rejects.toThrow(UnauthorizedError);
  });
});
