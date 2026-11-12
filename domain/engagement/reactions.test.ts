import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { PostKind, Role } from "@/lib/generated/prisma";
import { NotFoundError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { createPost } from "@/domain/posts";
import { createReport } from "@/domain/reports";
import { setReaction } from "@/domain/engagement";

afterEach(async () => {
  await cleanupDatabase();
});

async function setup() {
  const { community, building, apartment } =
    await createCommunityWithBuildingAndApartment();
  const author = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    apartmentId: apartment.id,
    role: Role.RESIDENT,
  });
  const neighbor = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    role: Role.RESIDENT,
  });
  const receptionist = await createUserWithMembership({
    communityId: community.id,
    role: Role.RECEPTIONIST,
  });
  const post = await createPost(author, community.id, {
    kind: PostKind.NEIGHBOR,
    title: "Pożyczę cukier",
    content: "Ktoś?",
  });
  return {
    community,
    building,
    apartment,
    author,
    neighbor,
    receptionist,
    post,
  };
}
const postT = (id: string) => ({ type: "post" as const, id });
// "own-apartment" is a PRIVATE category (domain/reports/catalog.ts); the author lives in s.apartment.
const privateReport = (s: Awaited<ReturnType<typeof setup>>) =>
  createReport(s.author, {
    communityId: s.community.id,
    categoryKey: "own-apartment",
    type: "DEFECT",
    title: "Cieknie kran",
    description: "Od wczoraj",
    apartmentId: s.apartment.id,
  });

describe("setReaction", () => {
  it("adds, switches and removes; one reaction per user", async () => {
    const s = await setup();
    expect(await setReaction(s.neighbor, postT(s.post.id), "LIKE")).toEqual({
      counts: { LIKE: 1 },
      total: 1,
      mine: "LIKE",
    });
    expect(await setReaction(s.neighbor, postT(s.post.id), "LOVE")).toEqual({
      counts: { LOVE: 1 },
      total: 1,
      mine: "LOVE",
    });
    await setReaction(s.author, postT(s.post.id), "LIKE");
    expect(await prisma.reaction.count()).toBe(2);
    expect(await setReaction(s.neighbor, postT(s.post.id), "LOVE")).toEqual({
      counts: { LIKE: 1 },
      total: 1,
      mine: null,
    });
    expect(await setReaction(s.author, postT(s.post.id), null)).toEqual({
      counts: {},
      total: 0,
      mine: null,
    });
  });

  it("notifies the author once per target, updating the count, never for own reactions", async () => {
    const s = await setup();
    await setReaction(s.author, postT(s.post.id), "LIKE"); // own: no notification
    expect(await prisma.notification.count()).toBe(0);
    await setReaction(s.neighbor, postT(s.post.id), "LIKE");
    await setReaction(s.receptionist, postT(s.post.id), "WOW");
    await setReaction(s.neighbor, postT(s.post.id), "LOVE"); // switch: no new notification
    const rows = await prisma.notification.findMany({
      where: { type: "REACTIONS_ADDED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(s.author.id);
    expect(rows[0].payload).toMatchObject({
      targetType: "post",
      targetId: s.post.id,
      count: 2,
    });
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { notificationId: rows[0].id },
    });
    expect(deliveries.every((d) => d.channel === "in-app")).toBe(true);
  });

  it("marks the aggregated notification unread again on a new reaction", async () => {
    const s = await setup();
    await setReaction(s.neighbor, postT(s.post.id), "LIKE");
    await prisma.notification.updateMany({ data: { readAt: new Date() } });
    await setReaction(s.receptionist, postT(s.post.id), "LIKE");
    const [row] = await prisma.notification.findMany({
      where: { type: "REACTIONS_ADDED" },
    });
    expect(row.readAt).toBeNull();
    expect(row.payload).toMatchObject({ count: 2 });
  });

  it("rejects reactions on private reports and hides other communities' targets", async () => {
    const s = await setup();
    const report = await privateReport(s);
    await expect(
      setReaction(s.author, { type: "report", id: report.id }, "LIKE"),
    ).rejects.toThrow(ValidationError);
    await expect(
      setReaction(s.neighbor, { type: "report", id: report.id }, "LIKE"),
    ).rejects.toThrow(NotFoundError);

    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({
      communityId: other.community.id,
      role: Role.RESIDENT,
    });
    await expect(
      setReaction(outsider, postT(s.post.id), "LIKE"),
    ).rejects.toThrow(NotFoundError);
  });

  it("survives concurrent duplicate first reactions", async () => {
    const s = await setup();
    await Promise.all([
      setReaction(s.neighbor, postT(s.post.id), "LIKE"),
      setReaction(s.neighbor, postT(s.post.id), "LIKE"),
    ]);
    expect(
      await prisma.reaction.count({ where: { userId: s.neighbor.id } }),
    ).toBeLessThanOrEqual(1);
    expect(
      await prisma.notification.count({ where: { type: "REACTIONS_ADDED" } }),
    ).toBeLessThanOrEqual(1);
  });

  it("reacts on public reports; other communities get NotFound", async () => {
    const s = await setup();
    const report = await createReport(s.author, {
      communityId: s.community.id,
      categoryKey: "technical",
      type: "DEFECT",
      title: "Winda",
      description: "Stoi",
    });
    expect(
      await setReaction(s.neighbor, { type: "report", id: report.id }, "LIKE"),
    ).toEqual({ counts: { LIKE: 1 }, total: 1, mine: "LIKE" });
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({
      communityId: other.community.id,
      role: Role.RESIDENT,
    });
    await expect(
      setReaction(outsider, { type: "report", id: report.id }, "LIKE"),
    ).rejects.toThrow(NotFoundError);
  });
});
