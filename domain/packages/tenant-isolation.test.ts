import { afterEach, describe, expect, it } from "vitest";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
  createPackageScenario,
} from "@/domain/__test-helpers__/fixtures";
import prisma from "@/lib/prisma";
import { createPackage, markPickedUp, listPackagesForViewer } from "@/domain/packages";
import { remindPackage } from "@/domain/packages/reminders";

afterEach(async () => {
  await cleanupDatabase();
});

describe("spec §31 critical business rules", () => {
  it("a resident cannot see another resident's package", async () => {
    const { community, building, apartment: apartmentA } =
      await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const residentA = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartmentA.id,
      role: Role.RESIDENT,
    });
    const residentB = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RESIDENT,
    });
    await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartmentA.id,
      recipientUserId: residentA.id,
    });

    const { items: visibleToB } = await listPackagesForViewer(residentB, community.id);
    expect(visibleToB).toHaveLength(0);
  });

  it("a resident cannot mark a package as picked up", async () => {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const pkg = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    await expect(markPickedUp(resident, pkg.id)).rejects.toThrow(UnauthorizedError);
  });

  it("a receptionist can hand over a package", async () => {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const pkg = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    const updated = await markPickedUp(receptionist, pkg.id);
    expect(updated.status).toBe("PICKED_UP");
  });

  it("a user from Community A cannot read Community B's packages", async () => {
    const { community: communityA, building: buildingA, apartment: apartmentA } =
      await createCommunityWithBuildingAndApartment();
    const { community: communityB, building: buildingB, apartment: apartmentB } =
      await createCommunityWithBuildingAndApartment();
    const receptionistB = await createUserWithMembership({
      communityId: communityB.id,
      buildingId: buildingB.id,
      role: Role.RECEPTIONIST,
    });
    const residentA = await createUserWithMembership({
      communityId: communityA.id,
      buildingId: buildingA.id,
      apartmentId: apartmentA.id,
      role: Role.RESIDENT,
    });
    await createPackage(receptionistB, {
      communityId: communityB.id,
      buildingId: buildingB.id,
      apartmentId: apartmentB.id,
    });

    await expect(listPackagesForViewer(residentA, communityB.id)).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("a receptionist of Community B cannot remind Community A's package", async () => {
    const a = await createPackageScenario();
    const b = await createPackageScenario();
    const pkgA = await createPackage(a.receptionist, {
      communityId: a.community.id,
      buildingId: a.building.id,
      apartmentId: a.apartment.id,
    });

    await expect(remindPackage(b.receptionist, pkgA.id)).rejects.toThrow(UnauthorizedError);
    expect(await prisma.notification.count({ where: { type: "PACKAGE_REMINDER" } })).toBe(0);
  });
});
