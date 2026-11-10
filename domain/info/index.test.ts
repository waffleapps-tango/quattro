import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
} from "@/domain/__test-helpers__/fixtures";
import {
  createSection,
  deleteSection,
  listSections,
  moveSection,
  updateSection,
} from "@/domain/info";

afterEach(async () => {
  await cleanupDatabase();
});

async function setup() {
  const { community } = await createCommunityWithBuildingAndApartment();
  const other = await createCommunityWithBuildingAndApartment();
  const admin = await createUserWithMembership({ communityId: community.id, role: Role.ADMIN });
  const resident = await createUserWithMembership({ communityId: community.id, role: Role.RESIDENT });
  const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.ADMIN });
  return { community, admin, resident, outsider };
}

const phones = {
  kind: "CONTACTS" as const,
  title: "Telefony alarmowe",
  contacts: [
    { name: "Policja", phone: "997" },
    { name: "Serwis wind", phone: "600 100 200", note: "24h" },
  ],
};

describe("info sections", () => {
  it("staff creates a contacts section with ordered contacts and an audit entry", async () => {
    const { community, admin } = await setup();
    const section = await createSection(admin, community.id, phones);
    expect(section.contacts.map((c) => c.name)).toEqual(["Policja", "Serwis wind"]);
    const audit = await prisma.auditLog.findMany({
      where: { entity: "InfoSection", entityId: section.id, action: "INFO_SECTION_CREATED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("resident can read but not write", async () => {
    const { community, admin, resident } = await setup();
    const section = await createSection(admin, community.id, phones);
    expect(await listSections(resident, community.id)).toHaveLength(1);
    await expect(createSection(resident, community.id, phones)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(updateSection(resident, section.id, phones)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(deleteSection(resident, section.id)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(moveSection(resident, section.id, "up")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("staff of another community cannot read or write", async () => {
    const { community, admin, outsider } = await setup();
    const section = await createSection(admin, community.id, phones);
    await expect(listSections(outsider, community.id)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(createSection(outsider, community.id, phones)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(updateSection(outsider, section.id, phones)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(deleteSection(outsider, section.id)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("update replaces contacts and can switch to a text section", async () => {
    const { community, admin } = await setup();
    const section = await createSection(admin, community.id, phones);
    const updated = await updateSection(admin, section.id, {
      kind: "CONTACTS",
      title: "Telefony",
      contacts: [{ name: "Straż", phone: "998" }],
    });
    expect(updated.contacts.map((c) => c.name)).toEqual(["Straż"]);
    const text = await updateSection(admin, section.id, { kind: "TEXT", title: "Śmieci", body: "Wtorek" });
    expect(text.contacts).toHaveLength(0);
    expect(text.body).toBe("Wtorek");
    expect(await prisma.infoContact.count()).toBe(0);
  });

  it("move swaps neighbours and is a no-op at the ends", async () => {
    const { community, admin } = await setup();
    const a = await createSection(admin, community.id, { kind: "TEXT", title: "A", body: "" });
    const b = await createSection(admin, community.id, { kind: "TEXT", title: "B", body: "" });
    await moveSection(admin, a.id, "up");
    expect((await listSections(admin, community.id)).map((s) => s.title)).toEqual(["A", "B"]);
    await moveSection(admin, b.id, "up");
    expect((await listSections(admin, community.id)).map((s) => s.title)).toEqual(["B", "A"]);
    await moveSection(admin, b.id, "up");
    expect((await listSections(admin, community.id)).map((s) => s.title)).toEqual(["B", "A"]);
  });

  it("delete removes the section and its contacts", async () => {
    const { community, admin } = await setup();
    const section = await createSection(admin, community.id, phones);
    await deleteSection(admin, section.id);
    expect(await listSections(admin, community.id)).toHaveLength(0);
    expect(await prisma.infoContact.count()).toBe(0);
  });
});
