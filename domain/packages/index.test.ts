import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError, NotFoundError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
  createPackageScenario,
} from "@/domain/__test-helpers__/fixtures";
import { createPackage, markPickedUp, listPackagesForViewer } from "@/domain/packages";

afterEach(async () => {
  await cleanupDatabase();
});

describe("createPackage", () => {
  it("creates a RECEIVED package and an audit entry when actor is staff", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });

    const pkg = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      trackingNumber: "TRK1",
    });

    expect(pkg.status).toBe("RECEIVED");
    expect(pkg.receivedById).toBe(receptionist.id);

    const audit = await prisma.auditLog.findMany({
      where: { entity: "Package", entityId: pkg.id, action: "PACKAGE_CREATED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("rejects a resident trying to register a package", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });

    await expect(
      createPackage(resident, {
        communityId: community.id,
        buildingId: building.id,
        apartmentId: apartment.id,
      }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("markPickedUp", () => {
  it("marks the package picked up and writes an audit entry", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
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
    expect(updated.pickedUpById).toBe(receptionist.id);
    expect(updated.pickedUpAt).not.toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: { entity: "Package", entityId: pkg.id, action: "PACKAGE_PICKED_UP" },
    });
    expect(audit).toHaveLength(1);
  });

  it("rejects a resident trying to mark a package picked up", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
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

  it("throws NotFoundError for a package that doesn't exist", async () => {
    const { community, building } = await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });

    await expect(markPickedUp(receptionist, "nonexistent-id")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("listPackagesForViewer", () => {
  it("lets staff see every package in their community", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });
    await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    const result = await listPackagesForViewer(receptionist, community.id);
    expect(result).toHaveLength(2);
  });

  it("only lets a resident see their own apartment's packages", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const otherApartment = await prisma.apartment.create({
      data: { buildingId: building.id, number: "202" },
    });
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

    const ownPackage = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });
    await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: otherApartment.id,
    });

    const result = await listPackagesForViewer(resident, community.id);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(ownPackage.id);
  });

  it("never leaks packages across communities", async () => {
    const { community: communityA, building: buildingA, apartment: apartmentA } =
      await createCommunityWithBuildingAndApartment();
    const { community: communityB, building: buildingB, apartment: apartmentB } =
      await createCommunityWithBuildingAndApartment();
    const receptionistA = await createUserWithMembership({
      communityId: communityA.id,
      buildingId: buildingA.id,
      role: Role.RECEPTIONIST,
    });
    const receptionistB = await createUserWithMembership({
      communityId: communityB.id,
      buildingId: buildingB.id,
      role: Role.RECEPTIONIST,
    });
    await createPackage(receptionistA, {
      communityId: communityA.id,
      buildingId: buildingA.id,
      apartmentId: apartmentA.id,
    });
    await createPackage(receptionistB, {
      communityId: communityB.id,
      buildingId: buildingB.id,
      apartmentId: apartmentB.id,
    });

    const resultA = await listPackagesForViewer(receptionistA, communityA.id);
    expect(resultA).toHaveLength(1);
    expect(resultA[0].communityId).toBe(communityA.id);
  });
});

describe("listPackagesForViewer with several apartments", () => {
  it("shows a resident the packages of every apartment they live in, and no others", async () => {
    const s = await createPackageScenario();
    const second = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "102" } });
    const third = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "103" } });
    await prisma.apartmentResidency.create({
      data: { kind: "OWNER", userId: s.resident.id, apartmentId: second.id, communityId: s.community.id },
    });
    const resident = await prisma.user.findUniqueOrThrow({
      where: { id: s.resident.id },
      include: { memberships: true, residencies: true },
    });
    for (const apartmentId of [s.apartment.id, second.id, third.id]) {
      await createPackage(s.receptionist, {
        communityId: s.community.id,
        buildingId: s.building.id,
        apartmentId,
      });
    }

    const visible = await listPackagesForViewer(resident, s.community.id);

    expect(visible.map((p) => p.apartmentId).sort()).toEqual([s.apartment.id, second.id].sort());
  });
});

describe("listPackagesForViewer with owners and tenants", () => {
  async function setup() {
    const base = await createCommunityWithBuildingAndApartment();
    const common = {
      communityId: base.community.id,
      buildingId: base.building.id,
      apartmentId: base.apartment.id,
      role: Role.RESIDENT,
    };
    const owner = await createUserWithMembership({ ...common, kind: "OWNER" });
    const tenant = await createUserWithMembership({ ...common, kind: "TENANT" });
    const receptionist = await createUserWithMembership({
      communityId: base.community.id,
      buildingId: base.building.id,
      role: Role.RECEPTIONIST,
    });
    return { ...base, owner, tenant, receptionist };
  }

  it("does not expose the recipient's email or clerk id to residents, but does to staff", async () => {
    const s = await setup();
    await prisma.apartmentResidency.updateMany({ where: { userId: s.owner.id }, data: { isPrimary: true } });
    await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });

    const [asTenant] = await listPackagesForViewer(s.tenant, s.community.id);
    expect(asTenant.recipient).not.toBeNull();
    expect(asTenant.recipient).not.toHaveProperty("email");
    expect(asTenant.recipient).not.toHaveProperty("clerkUserId");

    const [asStaff] = await listPackagesForViewer(s.receptionist, s.community.id);
    expect(asStaff.recipient).toHaveProperty("email", s.owner.email);
    expect(asStaff.recipient).not.toHaveProperty("clerkUserId");
  });

  it("masks a hidden recipient for staff and other residents, but not for themself", async () => {
    const s = await setup();
    await prisma.apartmentResidency.updateMany({ where: { userId: s.owner.id }, data: { isPrimary: true } });
    await prisma.user.update({
      where: { id: s.owner.id },
      data: { firstName: "Jan", lastName: "Kowalski", shareName: false },
    });
    await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });

    const placeholder = "Mieszkaniec Building A / 101";
    const [asStaff] = await listPackagesForViewer(s.receptionist, s.community.id);
    expect(asStaff.recipient).toMatchObject({ firstName: placeholder, lastName: null, email: "" });

    const [asTenant] = await listPackagesForViewer(s.tenant, s.community.id);
    expect(asTenant.recipient).toMatchObject({ firstName: placeholder, lastName: null });

    const [asOwner] = await listPackagesForViewer(s.owner, s.community.id);
    expect(asOwner.recipient).toMatchObject({ firstName: "Jan", lastName: "Kowalski" });
  });

  it("lets staff find a visible recipient by email search", async () => {
    const s = await setup();
    await prisma.apartmentResidency.updateMany({ where: { userId: s.owner.id }, data: { isPrimary: true } });
    await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });

    const found = await listPackagesForViewer(s.receptionist, s.community.id, { search: s.owner.email });
    expect(found).toHaveLength(1);
  });

  it("does not let staff find a hidden recipient by email search", async () => {
    const s = await setup();
    await prisma.apartmentResidency.updateMany({ where: { userId: s.owner.id }, data: { isPrimary: true } });
    await prisma.user.update({ where: { id: s.owner.id }, data: { shareName: false } });
    await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });

    const found = await listPackagesForViewer(s.receptionist, s.community.id, { search: s.owner.email });
    expect(found).toHaveLength(0);
  });

  it("shows the apartment's package to a renting-out owner and to an opted-out tenant", async () => {
    const s = await setup();
    await prisma.apartmentResidency.updateMany({ where: { userId: s.tenant.id }, data: { receivesPackages: false } });
    const pkg = await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });

    for (const viewer of [s.owner, s.tenant]) {
      const result = await listPackagesForViewer(viewer, s.community.id);
      expect(result.map((p) => p.id)).toEqual([pkg.id]);
    }
  });
});
