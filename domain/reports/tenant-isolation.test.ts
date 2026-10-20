import { afterEach, describe, expect, it } from "vitest";
import { Role } from "@/lib/generated/prisma";
import { NotFoundError, UnauthorizedError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
} from "@/domain/__test-helpers__/fixtures";
import { createReport, getReport, listReports } from "@/domain/reports";

afterEach(async () => {
  await cleanupDatabase();
});

describe("reports tenant isolation", () => {
  it("never leaks reports across communities", async () => {
    const a = await createCommunityWithBuildingAndApartment();
    const b = await createCommunityWithBuildingAndApartment();
    const residentA = await createUserWithMembership({
      communityId: a.community.id,
      buildingId: a.building.id,
      apartmentId: a.apartment.id,
      role: Role.RESIDENT,
    });
    const managerB = await createUserWithMembership({
      communityId: b.community.id,
      role: Role.MANAGER,
    });
    const report = await createReport(residentA, {
      communityId: a.community.id,
      categoryKey: "technical",
      type: "DEFECT",
      title: "Awaria windy",
      description: "Stoi",
    });

    await expect(listReports(managerB, a.community.id)).rejects.toThrow(UnauthorizedError);
    await expect(getReport(managerB, report.id)).rejects.toThrow(UnauthorizedError);
    expect(await listReports(managerB, b.community.id)).toHaveLength(0);
  });

  it("a resident cannot read another resident's private report by id", async () => {
    const a = await createCommunityWithBuildingAndApartment();
    const common = { communityId: a.community.id, buildingId: a.building.id };
    const resident1 = await createUserWithMembership({ ...common, apartmentId: a.apartment.id, role: Role.RESIDENT });
    const resident2 = await createUserWithMembership({ ...common, apartmentId: a.apartment.id, role: Role.RESIDENT });
    const report = await createReport(resident1, {
      communityId: a.community.id,
      categoryKey: "billing",
      type: "QUESTION",
      title: "Saldo",
      description: "Ile mam do zapłaty?",
    });

    await expect(getReport(resident2, report.id)).rejects.toThrow(NotFoundError);
  });
});
