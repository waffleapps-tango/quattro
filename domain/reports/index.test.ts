import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import {
  InvalidTransitionError,
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
} from "@/domain/__test-helpers__/fixtures";
import {
  changeStatus,
  createReport,
  getReport,
  listOwnedSpaces,
  listReports,
} from "@/domain/reports";

afterEach(async () => {
  await cleanupDatabase();
});

let community: { id: string };
let building: { id: string };
let apartment: { id: string };
let otherApartment: { id: string };
let resident: SessionUser;
let neighbour: SessionUser;
let receptionist: SessionUser;
let manager: SessionUser;

beforeEach(async () => {
  const base = await createCommunityWithBuildingAndApartment();
  community = base.community;
  building = base.building;
  apartment = base.apartment;
  otherApartment = await prisma.apartment.create({
    data: { buildingId: building.id, number: "202" },
  });
  const common = { communityId: community.id, buildingId: building.id };
  resident = await createUserWithMembership({ ...common, apartmentId: apartment.id, role: Role.RESIDENT });
  neighbour = await createUserWithMembership({ ...common, apartmentId: otherApartment.id, role: Role.RESIDENT });
  receptionist = await createUserWithMembership({ ...common, role: Role.RECEPTIONIST });
  manager = await createUserWithMembership({ ...common, role: Role.MANAGER });
});

const publicInput = () => ({
  communityId: community.id,
  categoryKey: "technical",
  type: "DEFECT" as const,
  title: "Awaria windy",
  description: "Winda stoi na 3 piętrze",
});

const privateInput = () => ({
  communityId: community.id,
  categoryKey: "own-apartment",
  type: "DEFECT" as const,
  title: "Zalanie mieszkania",
  description: "Woda z sufitu",
});

describe("createReport", () => {
  it("derives PUBLIC visibility from the category and writes an audit entry", async () => {
    const report = await createReport(resident, publicInput());

    expect(report.visibility).toBe("PUBLIC");
    expect(report.status).toBe("NEW");
    expect(report.authorId).toBe(resident.id);
    expect(report.apartmentId).toBeNull();
    const audit = await prisma.auditLog.findMany({
      where: { entity: "Report", entityId: report.id, action: "REPORT_CREATED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("derives PRIVATE visibility and takes the apartment from the membership", async () => {
    const report = await createReport(resident, privateInput());

    expect(report.visibility).toBe("PRIVATE");
    expect(report.apartmentId).toBe(apartment.id);
    expect(report.buildingId).toBe(building.id);
  });

  it("rejects an unknown category", async () => {
    await expect(
      createReport(resident, { ...publicInput(), categoryKey: "nope" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a type the category does not allow", async () => {
    await expect(
      createReport(resident, { ...publicInput(), type: "REQUEST" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an empty title", async () => {
    await expect(
      createReport(resident, { ...publicInput(), title: "   " }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a private report from a member without an apartment", async () => {
    await expect(createReport(manager, privateInput())).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a non-member", async () => {
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({
      communityId: other.community.id,
      role: Role.RESIDENT,
    });
    await expect(createReport(outsider, publicInput())).rejects.toThrow(UnauthorizedError);
  });

  it("attaches the resident's own parking space", async () => {
    const space = await prisma.parkingSpace.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, number: "P-1" },
    });

    const report = await createReport(resident, {
      communityId: community.id,
      categoryKey: "own-parking",
      type: "DEFECT",
      title: "Wyciek oleju",
      description: "Plama na miejscu",
      parkingSpaceId: space.id,
    });

    expect(report.parkingSpaceId).toBe(space.id);
  });

  it("requires a parking space for the own-parking category", async () => {
    await expect(
      createReport(resident, {
        communityId: community.id,
        categoryKey: "own-parking",
        type: "DEFECT",
        title: "x",
        description: "y",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects someone else's parking space", async () => {
    const space = await prisma.parkingSpace.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: otherApartment.id, number: "P-2" },
    });
    await expect(
      createReport(resident, {
        communityId: community.id,
        categoryKey: "own-parking",
        type: "DEFECT",
        title: "x",
        description: "y",
        parkingSpaceId: space.id,
      }),
    ).rejects.toThrow(TenantMismatchError);
  });

  it("rejects someone else's storage unit", async () => {
    const unit = await prisma.storageUnit.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: otherApartment.id, number: "K-1" },
    });
    await expect(
      createReport(resident, {
        communityId: community.id,
        categoryKey: "own-storage",
        type: "DEFECT",
        title: "x",
        description: "y",
        storageUnitId: unit.id,
      }),
    ).rejects.toThrow(TenantMismatchError);
  });

  it("rejects a parking space on a category without that subject", async () => {
    const space = await prisma.parkingSpace.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, number: "P-3" },
    });
    await expect(
      createReport(resident, { ...publicInput(), parkingSpaceId: space.id }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("listReports", () => {
  it("lets a resident see PUBLIC reports and only their own PRIVATE ones", async () => {
    const own = await createReport(resident, privateInput());
    const pub = await createReport(neighbour, publicInput());
    await createReport(neighbour, privateInput());

    const result = await listReports(resident, community.id);

    expect(result.map((r) => r.id).sort()).toEqual([own.id, pub.id].sort());
  });

  it("masks other authors' identity for residents but not for staff", async () => {
    const own = await createReport(resident, publicInput());
    const theirs = await createReport(neighbour, publicInput());

    const asResident = await listReports(resident, community.id);
    const asStaff = await listReports(receptionist, community.id);

    const byId = (list: typeof asResident, id: string) => list.find((r) => r.id === id)!;
    expect(byId(asResident, theirs.id).author).toEqual({ firstName: null, lastName: null, email: "" });
    expect(byId(asResident, own.id).author.email).toBe(resident.email);
    expect(byId(asStaff, theirs.id).author.email).toBe(neighbour.email);
  });

  it("lets a receptionist see PRIVATE reports too", async () => {
    await createReport(resident, privateInput());
    await createReport(neighbour, publicInput());

    const result = await listReports(receptionist, community.id);

    expect(result).toHaveLength(2);
  });

  it("applies the mine, visibility, status, category and urgent filters", async () => {
    const a = await createReport(resident, { ...publicInput(), urgent: true });
    await createReport(neighbour, publicInput());
    await createReport(resident, privateInput());
    await changeStatus(receptionist, a.id, "IN_PROGRESS");

    expect(await listReports(resident, community.id, { mine: true })).toHaveLength(2);
    expect(await listReports(manager, community.id, { visibility: "PRIVATE" })).toHaveLength(1);
    expect(await listReports(manager, community.id, { status: "IN_PROGRESS" })).toHaveLength(1);
    expect(await listReports(manager, community.id, { category: "own-apartment" })).toHaveLength(1);
    expect(await listReports(manager, community.id, { urgent: true })).toHaveLength(1);
  });

  it("rejects a user from another community", async () => {
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({
      communityId: other.community.id,
      role: Role.MANAGER,
    });
    await expect(listReports(outsider, community.id)).rejects.toThrow(UnauthorizedError);
  });
});

describe("getReport", () => {
  it("hides another resident's PRIVATE report as not found", async () => {
    const report = await createReport(neighbour, privateInput());
    await expect(getReport(resident, report.id)).rejects.toThrow(NotFoundError);
  });

  it("masks another author's identity on a PUBLIC report for residents only", async () => {
    const report = await createReport(neighbour, publicInput());
    expect((await getReport(resident, report.id)).author.email).toBe("");
    expect((await getReport(neighbour, report.id)).author.email).toBe(neighbour.email);
    expect((await getReport(receptionist, report.id)).author.email).toBe(neighbour.email);
  });

  it("returns a PRIVATE report to its author and to staff", async () => {
    const report = await createReport(resident, privateInput());
    expect((await getReport(resident, report.id)).id).toBe(report.id);
    expect((await getReport(receptionist, report.id)).id).toBe(report.id);
  });
});

describe("changeStatus", () => {
  it("lets exactly one of two concurrent decisions win", async () => {
    const request = await createReport(resident, {
      communityId: community.id,
      categoryKey: "balcony",
      type: "REQUEST",
      title: "Markiza",
      description: "Wniosek o zgodę",
    });

    const results = await Promise.allSettled([
      changeStatus(manager, request.id, "APPROVED"),
      changeStatus(manager, request.id, "REJECTED"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InvalidTransitionError);
    const audit = await prisma.auditLog.findMany({
      where: { entity: "Report", entityId: request.id, action: "REPORT_STATUS_CHANGED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("moves a defect through its flow, sets resolvedAt and audits each change", async () => {
    const report = await createReport(resident, publicInput());

    await changeStatus(receptionist, report.id, "IN_PROGRESS");
    const done = await changeStatus(receptionist, report.id, "RESOLVED");

    expect(done.status).toBe("RESOLVED");
    expect(done.resolvedAt).not.toBeNull();
    const audit = await prisma.auditLog.findMany({
      where: { entity: "Report", entityId: report.id, action: "REPORT_STATUS_CHANGED" },
    });
    expect(audit).toHaveLength(2);
  });

  it("rejects a transition the type does not allow", async () => {
    const report = await createReport(resident, publicInput());
    await expect(changeStatus(receptionist, report.id, "RESOLVED")).rejects.toThrow(
      InvalidTransitionError,
    );
  });

  it("rejects a resident changing status", async () => {
    const report = await createReport(resident, publicInput());
    await expect(changeStatus(resident, report.id, "IN_PROGRESS")).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("lets a manager approve a request but not a receptionist", async () => {
    const request = await createReport(resident, {
      communityId: community.id,
      categoryKey: "balcony",
      type: "REQUEST",
      title: "Markiza",
      description: "Wniosek o zgodę",
    });

    await expect(changeStatus(receptionist, request.id, "APPROVED")).rejects.toThrow(
      UnauthorizedError,
    );
    const approved = await changeStatus(manager, request.id, "APPROVED");
    expect(approved.status).toBe("APPROVED");
  });

  it("throws NotFoundError for a missing report", async () => {
    await expect(changeStatus(manager, "nope", "CLOSED")).rejects.toThrow(NotFoundError);
  });

  it("does not let staff of another community touch the report", async () => {
    const report = await createReport(resident, publicInput());
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({
      communityId: other.community.id,
      role: Role.MANAGER,
    });
    await expect(changeStatus(outsider, report.id, "IN_PROGRESS")).rejects.toThrow(
      UnauthorizedError,
    );
  });
});

describe("listOwnedSpaces", () => {
  it("returns only the spaces and units assigned to the member's apartment", async () => {
    const mine = await prisma.parkingSpace.create({
      data: { communityId: community.id, apartmentId: apartment.id, number: "P-1" },
    });
    await prisma.parkingSpace.create({
      data: { communityId: community.id, apartmentId: otherApartment.id, number: "P-2" },
    });
    const unit = await prisma.storageUnit.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, number: "K-1" },
    });

    const result = await listOwnedSpaces(resident, community.id);

    expect(result.parkingSpaces.map((s) => s.id)).toEqual([mine.id]);
    expect(result.storageUnits.map((u) => u.id)).toEqual([unit.id]);
  });

  it("returns nothing for a member without an apartment", async () => {
    const result = await listOwnedSpaces(manager, community.id);
    expect(result).toEqual({ parkingSpaces: [], storageUnits: [] });
  });
});

describe("several apartments", () => {
  async function residentOfTwo() {
    const second = await prisma.apartment.create({ data: { buildingId: building.id, number: "303" } });
    const residency = await prisma.apartmentResidency.create({
      data: { kind: "OWNER", userId: resident.id, apartmentId: second.id, communityId: community.id },
    });
    return { second, actor: { ...resident, residencies: [...resident.residencies, residency] } };
  }

  it("requires an explicit apartment when the user has more than one", async () => {
    const { actor } = await residentOfTwo();
    await expect(createReport(actor, privateInput())).rejects.toThrow(ValidationError);
  });

  it("files a private report for the chosen apartment and derives the building", async () => {
    const { second, actor } = await residentOfTwo();

    const report = await createReport(actor, { ...privateInput(), apartmentId: second.id });

    expect(report.apartmentId).toBe(second.id);
    expect(report.buildingId).toBe(building.id);
  });

  it("rejects an apartment the user does not live in", async () => {
    await expect(
      createReport(resident, { ...privateInput(), apartmentId: otherApartment.id }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("lists the spaces of every apartment the user lives in, and only those", async () => {
    const { second, actor } = await residentOfTwo();
    const a = await prisma.parkingSpace.create({ data: { communityId: community.id, apartmentId: apartment.id, number: "P-10" } });
    const b = await prisma.parkingSpace.create({ data: { communityId: community.id, apartmentId: second.id, number: "P-11" } });
    await prisma.parkingSpace.create({ data: { communityId: community.id, apartmentId: otherApartment.id, number: "P-12" } });

    const result = await listOwnedSpaces(actor, community.id);

    expect(result.parkingSpaces.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("only accepts a parking space that belongs to the chosen apartment", async () => {
    const { second, actor } = await residentOfTwo();
    const space = await prisma.parkingSpace.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, number: "P-20" },
    });

    await expect(
      createReport(actor, {
        communityId: community.id,
        categoryKey: "own-parking",
        type: "DEFECT",
        title: "Brama",
        description: "Nie działa",
        apartmentId: second.id,
        parkingSpaceId: space.id,
      }),
    ).rejects.toThrow(TenantMismatchError);
  });

  it("derives the apartment from the named parking space when none is given", async () => {
    const { second, actor } = await residentOfTwo();
    const space = await prisma.parkingSpace.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: second.id, number: "P-30" },
    });

    const report = await createReport(actor, {
      communityId: community.id,
      categoryKey: "own-parking",
      type: "DEFECT",
      title: "Brama",
      description: "Nie działa",
      parkingSpaceId: space.id,
    });

    expect(report.apartmentId).toBe(second.id);
  });

  it("does not derive the apartment from a space of a foreign apartment", async () => {
    const { actor } = await residentOfTwo();
    const space = await prisma.parkingSpace.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: otherApartment.id, number: "P-31" },
    });

    await expect(
      createReport(actor, {
        communityId: community.id,
        categoryKey: "own-parking",
        type: "DEFECT",
        title: "Brama",
        description: "Nie działa",
        parkingSpaceId: space.id,
      }),
    ).rejects.toThrow(ValidationError);
  });
});
