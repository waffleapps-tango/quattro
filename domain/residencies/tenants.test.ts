import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { addTenant, removeResidency } from "@/domain/residencies";

afterEach(async () => {
  await cleanupDatabase();
});

let community: { id: string };
let building: { id: string };
let apartment: { id: string };
let owner: SessionUser;
let manager: SessionUser;

beforeEach(async () => {
  const base = await createCommunityWithBuildingAndApartment();
  community = base.community;
  building = base.building;
  apartment = base.apartment;
  owner = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    apartmentId: apartment.id,
    role: Role.RESIDENT,
    kind: "OWNER",
  });
  manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });
});

describe("addTenant", () => {
  it("lets an owner add a tenant: user, RESIDENT membership and TENANT link, with an audit entry", async () => {
    const link = await addTenant(owner, { apartmentId: apartment.id, email: "tenant@example.com" });

    expect(link.kind).toBe("TENANT");
    expect(link.apartmentId).toBe(apartment.id);
    expect(link.communityId).toBe(community.id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "tenant@example.com" },
      include: { memberships: true },
    });
    expect(user.memberships.map((m) => m.role)).toEqual([Role.RESIDENT]);
    const audit = await prisma.auditLog.findMany({ where: { action: "RESIDENCY_ADDED", entityId: link.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ kind: "TENANT" });
  });

  it("lets an admin or manager add a tenant", async () => {
    const link = await addTenant(manager, { apartmentId: apartment.id, email: "t2@example.com" });
    expect(link.kind).toBe("TENANT");
  });

  it("rejects a duplicate link", async () => {
    await addTenant(owner, { apartmentId: apartment.id, email: "dup@example.com" });
    await expect(
      addTenant(owner, { apartmentId: apartment.id, email: "dup@example.com" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a tenant, an owner of another apartment and another community's manager", async () => {
    const tenantLink = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    const tenantUser = await prisma.user.findUniqueOrThrow({
      where: { email: "t@example.com" },
      include: { memberships: true, residencies: true },
    });
    expect(tenantLink.kind).toBe("TENANT");
    await expect(
      addTenant(tenantUser, { apartmentId: apartment.id, email: "x@example.com" }),
    ).rejects.toThrow(UnauthorizedError);

    const otherApartment = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const otherOwner = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: otherApartment.id,
      role: Role.RESIDENT,
      kind: "OWNER",
    });
    await expect(
      addTenant(otherOwner, { apartmentId: apartment.id, email: "x@example.com" }),
    ).rejects.toThrow(UnauthorizedError);

    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });
    await expect(
      addTenant(outsider, { apartmentId: apartment.id, email: "x@example.com" }),
    ).rejects.toThrow(UnauthorizedError);
    expect(await prisma.user.count({ where: { email: "x@example.com" } })).toBe(0);
  });

  it("throws NotFoundError for an unknown apartment", async () => {
    await expect(addTenant(owner, { apartmentId: "missing", email: "x@example.com" })).rejects.toThrow(NotFoundError);
  });
});

describe("removeResidency permissions", () => {
  it("lets an owner remove a tenant but not an owner link", async () => {
    const tenantLink = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    const ownerLink = await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: owner.id } });

    await removeResidency(owner, tenantLink.id);
    expect(await prisma.apartmentResidency.count({ where: { id: tenantLink.id } })).toBe(0);

    await expect(removeResidency(owner, ownerLink.id)).rejects.toThrow(UnauthorizedError);
    expect(await prisma.apartmentResidency.count({ where: { id: ownerLink.id } })).toBe(1);
  });

  it("lets a manager remove an owner link", async () => {
    const ownerLink = await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: owner.id } });
    await removeResidency(manager, ownerLink.id);
    expect(await prisma.apartmentResidency.count({ where: { id: ownerLink.id } })).toBe(0);
  });

  it("rejects an owner of a different apartment removing a tenant", async () => {
    const tenantLink = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    const otherApartment = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const otherOwner = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: otherApartment.id,
      role: Role.RESIDENT,
      kind: "OWNER",
    });
    await expect(removeResidency(otherOwner, tenantLink.id)).rejects.toThrow(UnauthorizedError);
  });
});

describe("removeResidency and the tenant's membership", () => {
  const membershipCount = (email: string) =>
    prisma.membership.count({ where: { user: { email }, communityId: community.id } });

  it("deletes the RESIDENT membership when an owner removes the last link", async () => {
    const link = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    await removeResidency(owner, link.id);
    expect(await membershipCount("t@example.com")).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "RESIDENCY_REMOVED", entityId: link.id } });
    expect(audit.metadata).toMatchObject({ removedMembership: true });
  });

  it("keeps the membership when the tenant still has another residency", async () => {
    const link = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    const other = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "t@example.com" } });
    await prisma.apartmentResidency.create({
      data: { userId: user.id, apartmentId: other.id, communityId: community.id, kind: "OWNER" },
    });
    await removeResidency(owner, link.id);
    expect(await membershipCount("t@example.com")).toBe(1);
  });

  it("keeps the membership when a manager removes the link", async () => {
    const link = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    await removeResidency(manager, link.id);
    expect(await membershipCount("t@example.com")).toBe(1);
  });

  it("keeps a non-RESIDENT membership", async () => {
    const staff = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
      email: "staff@example.com",
    });
    const link = await addTenant(owner, { apartmentId: apartment.id, email: "staff@example.com" });
    await removeResidency(owner, link.id);
    expect(await membershipCount("staff@example.com")).toBe(1);
    expect(staff.id).toBeTruthy();
  });
});
