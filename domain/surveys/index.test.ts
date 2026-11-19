import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { castVote, createSurveyPost, getSurveyResults } from "@/domain/surveys";

afterEach(async () => {
  await cleanupDatabase();
});

async function setup() {
  const { community, building } = await createCommunityWithBuildingAndApartment();
  const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });
  const resident = await createUserWithMembership({ communityId: community.id, buildingId: building.id, role: Role.RESIDENT });
  const other = await createCommunityWithBuildingAndApartment();
  const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.RESIDENT });
  return { community, manager, resident, outsider };
}
const survey = (options = ["Tak", "Nie"]) => ({ title: "Remont?", content: "Głosujcie", options });

describe("createSurveyPost", () => {
  it("lets staff create and stores options in order", async () => {
    const s = await setup();
    const post = await createSurveyPost(s.manager, s.community.id, survey(["A", "B", "C"]));
    const opts = await prisma.surveyOption.findMany({ where: { postId: post.id }, orderBy: { position: "asc" } });
    expect(post.kind).toBe("SURVEY");
    expect(opts.map((o) => o.label)).toEqual(["A", "B", "C"]);
  });

  it("rejects residents", async () => {
    const s = await setup();
    await expect(createSurveyPost(s.resident, s.community.id, survey())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("enforces 2..8 options of at most 120 chars, ignoring blanks", async () => {
    const s = await setup();
    const bad = [["A"], ["A", " "], Array.from({ length: 9 }, (_, i) => `o${i}`), ["A", "x".repeat(121)]];
    for (const options of bad) {
      await expect(createSurveyPost(s.manager, s.community.id, survey(options))).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(
      createSurveyPost(s.manager, s.community.id, survey(Array.from({ length: 8 }, (_, i) => `o${i}`))),
    ).resolves.toBeTruthy();
  });
});

describe("castVote / getSurveyResults", () => {
  it("upserts so a second vote changes the first", async () => {
    const s = await setup();
    const post = await createSurveyPost(s.manager, s.community.id, survey());
    const [a, b] = await prisma.surveyOption.findMany({ where: { postId: post.id }, orderBy: { position: "asc" } });
    await castVote(s.resident, post.id, a.id);
    await castVote(s.resident, post.id, b.id);
    await castVote(s.manager, post.id, b.id);
    const r = await getSurveyResults(s.resident, post.id);
    expect(r.total).toBe(2);
    expect(r.myVoteId).toBe(b.id);
    expect(r.options.map((o) => [o.votes, o.mine])).toEqual([[0, false], [2, true]]);
  });

  it("rejects non-members and options of another post", async () => {
    const s = await setup();
    const p1 = await createSurveyPost(s.manager, s.community.id, survey());
    const p2 = await createSurveyPost(s.manager, s.community.id, survey());
    const [o1] = await prisma.surveyOption.findMany({ where: { postId: p1.id } });
    await expect(castVote(s.outsider, p1.id, o1.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(castVote(s.resident, p2.id, o1.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getSurveyResults(s.outsider, p1.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
