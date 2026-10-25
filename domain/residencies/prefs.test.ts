import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import {
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { setPrimaryContact, updateResidencyPrefs } from "@/domain/residencies/prefs";

afterEach(async () => {
  await cleanupDatabase();
});

let community: { id: string };
let building: { id: string };
let apartment: { id: string };
let owner: SessionUser;
let tenant: SessionUser;
let manager: SessionUser;
let ownerLink: { id: string };
let tenantLink: { id: string };

const linkOf = (userId: string) =>
  prisma.apartmentResidency.findFirstOrThrow({ where: { userId } });

beforeEach(async () => {
  const base = await createCommunityWithBuildingAndApartment();
  community = base.community;
  building = base.building;
  apartment = base.apartment;
  const common = { communityId: community.id, buildingId: building.id, apartmentId: apartment.id };
  owner = await createUserWithMembership({ ...common, role: Role.RESIDENT, kind: "OWNER" });
  tenant = await createUserWithMembership({ ...common, role: Role.RESIDENT, kind: "TENANT" });
  manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });
  ownerLink = await linkOf(owner.id);
  tenantLink = await linkOf(tenant.id);
});

describe("updateResidencyPrefs", () => {
  it("lets a person opt out, which also clears their primary-contact flag", async () => {
    await prisma.apartmentResidency.update({ where: { id: tenantLink.id }, data: { isPrimary: true } });

    const updated = await updateResidencyPrefs(tenant, tenantLink.id, { receivesPackages: false });

    expect(updated.receivesPackages).toBe(false);
    expect(updated.isPrimary).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "RESIDENCY_PREFS_CHANGED", entityId: tenantLink.id } })).toBe(1);
  });

  it("lets an owner set and clear the lives-here override", async () => {
    const set = await updateResidencyPrefs(owner, ownerLink.id, { livesHereOverride: true });
    expect(set.livesHereOverride).toBe(true);
    const cleared = await updateResidencyPrefs(owner, ownerLink.id, { livesHereOverride: null });
    expect(cleared.livesHereOverride).toBeNull();
  });

  it("rejects the override on a tenant link", async () => {
    await expect(
      updateResidencyPrefs(tenant, tenantLink.id, { livesHereOverride: true }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects changing someone else's link, but allows a manager", async () => {
    await expect(
      updateResidencyPrefs(tenant, ownerLink.id, { receivesPackages: false }),
    ).rejects.toThrow(UnauthorizedError);
    const updated = await updateResidencyPrefs(manager, ownerLink.id, { receivesPackages: false });
    expect(updated.receivesPackages).toBe(false);
  });

  it("rejects a manager of another community and an unknown link", async () => {
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });
    await expect(
      updateResidencyPrefs(outsider, ownerLink.id, { receivesPackages: false }),
    ).rejects.toThrow(UnauthorizedError);
    await expect(updateResidencyPrefs(owner, "missing", { receivesPackages: false })).rejects.toThrow(NotFoundError);
  });
});

describe("setPrimaryContact", () => {
  it("lets an owner set a tenant as primary and keeps only one primary", async () => {
    await setPrimaryContact(owner, apartment.id, tenantLink.id);
    await setPrimaryContact(owner, apartment.id, ownerLink.id);

    const links = await prisma.apartmentResidency.findMany({ where: { apartmentId: apartment.id } });
    expect(links.filter((l) => l.isPrimary).map((l) => l.id)).toEqual([ownerLink.id]);
    expect(await prisma.auditLog.count({ where: { action: "PRIMARY_CONTACT_CHANGED" } })).toBe(2);
  });

  it("clears the primary contact with null", async () => {
    await setPrimaryContact(owner, apartment.id, tenantLink.id);
    await setPrimaryContact(owner, apartment.id, null);
    expect(await prisma.apartmentResidency.count({ where: { apartmentId: apartment.id, isPrimary: true } })).toBe(0);
  });

  it("allows a manager and rejects a tenant, a stranger and another community's manager", async () => {
    await setPrimaryContact(manager, apartment.id, ownerLink.id);
    await expect(setPrimaryContact(tenant, apartment.id, tenantLink.id)).rejects.toThrow(UnauthorizedError);

    const stray = await createUserWithMembership({ communityId: community.id, role: Role.RESIDENT });
    await expect(setPrimaryContact(stray, apartment.id, ownerLink.id)).rejects.toThrow(UnauthorizedError);

    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });
    await expect(setPrimaryContact(outsider, apartment.id, ownerLink.id)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a target from another apartment, an opted-out target and an unknown apartment", async () => {
    const secondApartment = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const neighbour = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: secondApartment.id,
      role: Role.RESIDENT,
    });
    const neighbourLink = await linkOf(neighbour.id);
    await expect(setPrimaryContact(owner, apartment.id, neighbourLink.id)).rejects.toThrow(TenantMismatchError);

    await prisma.apartmentResidency.update({ where: { id: tenantLink.id }, data: { receivesPackages: false } });
    await expect(setPrimaryContact(owner, apartment.id, tenantLink.id)).rejects.toThrow(ValidationError);

    await expect(setPrimaryContact(owner, "missing", null)).rejects.toThrow(NotFoundError);
  });
});
