import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import { TenantMismatchError, UnauthorizedError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { createPackage } from "@/domain/packages";
import { remindPackage } from "@/domain/packages/reminders";
import { getPackageRecipientOptions } from "@/domain/residencies/recipients";

afterEach(async () => {
  await cleanupDatabase();
});

let community: { id: string };
let building: { id: string };
let apartment: { id: string };
let owner: SessionUser;
let tenant: SessionUser;
let receptionist: SessionUser;

const linkOf = (userId: string) => prisma.apartmentResidency.findFirstOrThrow({ where: { userId } });
const register = (extra: { recipientUserId?: string; allResidents?: boolean } = {}) =>
  createPackage(receptionist, {
    communityId: community.id,
    buildingId: building.id,
    apartmentId: apartment.id,
    ...extra,
  });
const notified = async () =>
  (await prisma.notification.findMany({ where: { type: "PACKAGE_RECEIVED" } }))
    .map((n) => n.recipientUserId)
    .sort();

beforeEach(async () => {
  const base = await createCommunityWithBuildingAndApartment();
  community = base.community;
  building = base.building;
  apartment = base.apartment;
  const common = { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, role: Role.RESIDENT };
  owner = await createUserWithMembership({ ...common, kind: "OWNER" });
  tenant = await createUserWithMembership({ ...common, kind: "TENANT" });
  receptionist = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    role: Role.RECEPTIONIST,
  });
});

describe("package recipients", () => {
  it("by default notifies the people who live there: the tenant, not the renting-out owner", async () => {
    const pkg = await register();
    expect(pkg.recipientUserId).toBeNull();
    expect(await notified()).toEqual([tenant.id]);
  });

  it("includes an owner who says they live there too", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { livesHereOverride: true } });
    await register();
    expect(await notified()).toEqual([owner.id, tenant.id].sort());
  });

  it("uses the primary contact as the default and stores them as the recipient", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { isPrimary: true } });
    const pkg = await register();
    expect(pkg.recipientUserId).toBe(owner.id);
    expect(await notified()).toEqual([owner.id]);
  });

  it("ALL residents overrides the primary contact", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { isPrimary: true } });
    const pkg = await register({ allResidents: true });
    expect(pkg.recipientUserId).toBeNull();
    expect(await notified()).toEqual([tenant.id]);
  });

  it("lets reception name a non-living owner, who is then notified", async () => {
    const pkg = await register({ recipientUserId: owner.id });
    expect(pkg.recipientUserId).toBe(owner.id);
    expect(await notified()).toEqual([owner.id]);
  });

  it("never notifies someone who opted out, and rejects naming them", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(tenant.id)).id }, data: { receivesPackages: false } });
    await register();
    expect(await notified()).toEqual([]);
    await expect(register({ recipientUserId: tenant.id })).rejects.toThrow(TenantMismatchError);
  });

  it("ignores a primary contact who opted out", async () => {
    await prisma.apartmentResidency.update({
      where: { id: (await linkOf(tenant.id)).id },
      data: { isPrimary: true, receivesPackages: false },
    });
    const pkg = await register();
    expect(pkg.recipientUserId).toBeNull();
  });

  it("rejects a named recipient from another apartment", async () => {
    const other = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const neighbour = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: other.id,
      role: Role.RESIDENT,
    });
    await expect(register({ recipientUserId: neighbour.id })).rejects.toThrow(TenantMismatchError);
  });
});

describe("getPackageRecipientOptions", () => {
  it("defaults to all residents and lists everyone who receives packages, owners first", async () => {
    const result = await getPackageRecipientOptions(receptionist, community.id, apartment.id);
    expect(result.default).toEqual({ type: "all" });
    expect(result.options.map((o) => [o.userId, o.kind])).toEqual([
      [owner.id, "OWNER"],
      [tenant.id, "TENANT"],
    ]);
  });

  it("defaults to the primary contact when one is set", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(tenant.id)).id }, data: { isPrimary: true } });
    const result = await getPackageRecipientOptions(receptionist, community.id, apartment.id);
    expect(result.default).toMatchObject({ type: "primary", userId: tenant.id });
  });

  it("leaves out people who opted out", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { receivesPackages: false } });
    const result = await getPackageRecipientOptions(receptionist, community.id, apartment.id);
    expect(result.options.map((o) => o.userId)).toEqual([tenant.id]);
  });

  it("is staff only and tenant-scoped", async () => {
    await expect(getPackageRecipientOptions(owner, community.id, apartment.id)).rejects.toThrow(UnauthorizedError);
    const other = await createCommunityWithBuildingAndApartment();
    await expect(
      getPackageRecipientOptions(receptionist, community.id, other.apartment.id),
    ).rejects.toThrow(TenantMismatchError);
  });
});

describe("stale stored recipients", () => {
  const reminded = async () =>
    (await prisma.notification.findMany({ where: { type: "PACKAGE_REMINDER" } }))
      .map((n) => n.recipientUserId)
      .sort();

  it("reminds the effective residents when the stored recipient later opts out", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { isPrimary: true } });
    const pkg = await register();
    expect(pkg.recipientUserId).toBe(owner.id);
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { receivesPackages: false } });

    await remindPackage(receptionist, pkg.id);
    expect(await reminded()).toEqual([tenant.id]);
  });

  it("reminds the effective residents when the stored recipient's link is deleted", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { isPrimary: true } });
    const pkg = await register();
    await prisma.apartmentResidency.delete({ where: { id: (await linkOf(owner.id)).id } });

    await remindPackage(receptionist, pkg.id);
    expect(await reminded()).toEqual([tenant.id]);
  });
});
