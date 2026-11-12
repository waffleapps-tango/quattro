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
import { parsePackageQuery } from "@/domain/packages/query";

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

    const { items: result } = await listPackagesForViewer(receptionist, community.id);
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

    const { items: result } = await listPackagesForViewer(resident, community.id);

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

    const { items: resultA } = await listPackagesForViewer(receptionistA, communityA.id);
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

    const { items: visible } = await listPackagesForViewer(resident, s.community.id);

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

    const { items: [asTenant] } = await listPackagesForViewer(s.tenant, s.community.id);
    expect(asTenant.recipient).not.toBeNull();
    expect(asTenant.recipient).not.toHaveProperty("email");
    expect(asTenant.recipient).not.toHaveProperty("clerkUserId");

    const { items: [asStaff] } = await listPackagesForViewer(s.receptionist, s.community.id);
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
    const { items: [asStaff] } = await listPackagesForViewer(s.receptionist, s.community.id);
    expect(asStaff.recipient).toMatchObject({ firstName: placeholder, lastName: null, email: "" });

    const { items: [asTenant] } = await listPackagesForViewer(s.tenant, s.community.id);
    expect(asTenant.recipient).toMatchObject({ firstName: placeholder, lastName: null });

    const { items: [asOwner] } = await listPackagesForViewer(s.owner, s.community.id);
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

    const found = (await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ q: s.owner.email }))).items;
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

    const found = (await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ q: s.owner.email }))).items;
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
      const { items: result } = await listPackagesForViewer(viewer, s.community.id);
      expect(result.map((p) => p.id)).toEqual([pkg.id]);
    }
  });
});

describe("listPackagesForViewer filters, sorting and pagination", () => {
  async function seed() {
    const s = await createPackageScenario(); // Building A, apartment 101, receptionist, resident (apt 101)
    const buildingB = await prisma.building.create({
      data: { communityId: s.community.id, name: "Building B" },
    });
    const apt202 = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "202" } });
    const aptB1 = await prisma.apartment.create({ data: { buildingId: buildingB.id, number: "1" } });
    const make = (
      apartmentId: string,
      buildingId: string,
      extra: { recipientUserId?: string; trackingNumber?: string; courier?: string } = {},
    ) =>
      createPackage(s.receptionist, { communityId: s.community.id, buildingId, apartmentId, ...extra });
    return { ...s, buildingB, apt202, aptB1, make };
  }
  const ids = (r: { items: { id: string }[] }) => r.items.map((p) => p.id);

  it("hides picked-up packages by default and shows them with status=all", async () => {
    const s = await seed();
    const open = await s.make(s.apartment.id, s.building.id);
    const done = await s.make(s.apartment.id, s.building.id);
    await markPickedUp(s.receptionist, done.id);

    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id))).toEqual([open.id]);
    const all = await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ status: "all" }));
    expect(ids(all).sort()).toEqual([open.id, done.id].sort());
    expect(all.total).toBe(2);
  });

  it("filters by building and by apartment number (contains)", async () => {
    const s = await seed();
    const a101 = await s.make(s.apartment.id, s.building.id);
    const a202 = await s.make(s.apt202.id, s.building.id);
    const b1 = await s.make(s.aptB1.id, s.buildingB.id);

    const byBuilding = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ building: s.buildingB.id }),
    );
    expect(ids(byBuilding)).toEqual([b1.id]);

    const byApartment = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ apartment: "20" }),
    );
    expect(ids(byApartment)).toEqual([a202.id]);
    expect(ids(byApartment)).not.toContain(a101.id);
  });

  it("filters by recipient name or email, and never matches a masked recipient", async () => {
    const s = await seed();
    await prisma.user.update({
      where: { id: s.resident.id },
      data: { firstName: "Jan", lastName: "Kowalski" },
    });
    const pkg = await s.make(s.apartment.id, s.building.id, { recipientUserId: s.resident.id });
    await s.make(s.apt202.id, s.building.id);

    const byName = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ recipient: "jan kow" }),
    );
    expect(ids(byName)).toEqual([pkg.id]);

    await prisma.user.update({ where: { id: s.resident.id }, data: { shareName: false } });
    const masked = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ recipient: "jan" }),
    );
    expect(masked.items).toHaveLength(0);
  });

  it("searches q across tracking number and courier", async () => {
    const s = await seed();
    const byTracking = await s.make(s.apartment.id, s.building.id, { trackingNumber: "ABC123" });
    const byCourier = await s.make(s.apt202.id, s.building.id, { courier: "InPost" });
    await s.make(s.aptB1.id, s.buildingB.id, { trackingNumber: "ZZZ" });

    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ q: "abc" })))).toEqual([byTracking.id]);
    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ q: "inpost" })))).toEqual([byCourier.id]);
  });

  it("sorts by apartment (building name, then number) in both directions", async () => {
    const s = await seed();
    const b1 = await s.make(s.aptB1.id, s.buildingB.id);
    const a202 = await s.make(s.apt202.id, s.building.id);
    const a101 = await s.make(s.apartment.id, s.building.id);

    const asc = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ sort: "apartment", dir: "asc" }),
    );
    expect(ids(asc)).toEqual([a101.id, a202.id, b1.id]);
    const desc = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ sort: "apartment", dir: "desc" }),
    );
    expect(ids(desc)).toEqual([b1.id, a202.id, a101.id]);
  });

  it("sorts by received date, newest first by default", async () => {
    const s = await seed();
    const old = await s.make(s.apartment.id, s.building.id);
    const mid = await s.make(s.apt202.id, s.building.id);
    const recent = await s.make(s.aptB1.id, s.buildingB.id);
    const day = 24 * 60 * 60 * 1000;
    for (const [pkg, ago] of [[old, 10], [mid, 5], [recent, 1]] as const) {
      await prisma.package.update({ where: { id: pkg.id }, data: { receivedAt: new Date(Date.now() - ago * day) } });
    }

    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id))).toEqual([recent.id, mid.id, old.id]);
    const asc = await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ dir: "asc" }));
    expect(ids(asc)).toEqual([old.id, mid.id, recent.id]);
  });

  it("paginates 20 per page and clamps a page past the end", async () => {
    const s = await seed();
    await prisma.package.createMany({
      data: Array.from({ length: 25 }, () => ({
        communityId: s.community.id,
        buildingId: s.building.id,
        apartmentId: s.apartment.id,
        receivedById: s.receptionist.id,
      })),
    });

    const p1 = await listPackagesForViewer(s.receptionist, s.community.id);
    expect([p1.items.length, p1.total, p1.page, p1.pageSize]).toEqual([20, 25, 1, 20]);
    const p2 = await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ page: "2" }));
    expect([p2.items.length, p2.page]).toEqual([5, 2]);
    const far = await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ page: "99" }));
    expect([far.items.length, far.page]).toEqual([5, 2]);
    expect(new Set([...ids(p1), ...ids(p2)]).size).toBe(25);
  });

  it("keeps a resident to their own apartment whatever the params say", async () => {
    const s = await seed();
    const own = await s.make(s.apartment.id, s.building.id);
    await s.make(s.apt202.id, s.building.id);
    await s.make(s.aptB1.id, s.buildingB.id);

    const result = await listPackagesForViewer(
      s.resident,
      s.community.id,
      parsePackageQuery({ building: s.buildingB.id, apartment: "202", recipient: "x", status: "all" }),
    );
    expect(ids(result)).toEqual([own.id]);
    expect(result.total).toBe(1);
  });

  it("does not let a resident probe a co-resident's email through q", async () => {
    const s = await seed();
    const neighbor = await createUserWithMembership({
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
      role: Role.RESIDENT,
      email: "neighbor-probe@example.com",
    });
    const pkg = await s.make(s.apartment.id, s.building.id, { recipientUserId: neighbor.id });
    const q = parsePackageQuery({ q: "neighbor-probe", status: "all" });

    // Access is fine: the resident sees the package when not searching by email.
    const plain = await listPackagesForViewer(s.resident, s.community.id, parsePackageQuery({ status: "all" }));
    expect(ids(plain)).toEqual([pkg.id]);
    expect((await listPackagesForViewer(s.resident, s.community.id, q)).items).toHaveLength(0);
    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id, q))).toEqual([pkg.id]);
  });

  it("sorts by status in both directions", async () => {
    const s = await seed();
    const received = await s.make(s.apartment.id, s.building.id);
    const ready = await s.make(s.apt202.id, s.building.id);
    const done = await s.make(s.aptB1.id, s.buildingB.id);
    await prisma.package.update({ where: { id: ready.id }, data: { status: "READY_FOR_PICKUP" } });
    await markPickedUp(s.receptionist, done.id);

    const asc = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ status: "all", sort: "status", dir: "asc" }),
    );
    expect(ids(asc)).toEqual([received.id, ready.id, done.id]);
    const desc = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ status: "all", sort: "status", dir: "desc" }),
    );
    expect(ids(desc)).toEqual([done.id, ready.id, received.id]);
  });

  it("hides picked-up packages from a resident's default view", async () => {
    const s = await seed();
    const open = await s.make(s.apartment.id, s.building.id);
    const done = await s.make(s.apartment.id, s.building.id);
    await markPickedUp(s.receptionist, done.id);

    expect(ids(await listPackagesForViewer(s.resident, s.community.id))).toEqual([open.id]);
    const all = await listPackagesForViewer(s.resident, s.community.id, parsePackageQuery({ status: "all" }));
    expect(ids(all).sort()).toEqual([open.id, done.id].sort());
  });
});
