import { afterEach, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { PostKind, Role } from "@/lib/generated/prisma";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { createPost } from "@/domain/posts";
import { addComment, deleteComment, setReaction, engagementSummary, EMPTY_ENGAGEMENT } from "@/domain/engagement";

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

it("summarises reactions, comment counts and previews for many targets in one call", async () => {
  const s = await setup();
  const second = await createPost(s.author, s.community.id, { kind: PostKind.NEIGHBOR, title: "Drugi", content: "c" });
  await setReaction(s.neighbor, postT(s.post.id), "LIKE");
  await setReaction(s.receptionist, postT(s.post.id), "LOVE");
  await setReaction(s.author, postT(s.post.id), "LIKE");
  await addComment(s.neighbor, postT(s.post.id), { body: "1" });
  await addComment(s.neighbor, postT(s.post.id), { body: "2" });
  const thread = await addComment(s.neighbor, postT(s.post.id), { body: "3" });
  await deleteComment(s.neighbor, postT(s.post.id), thread[0].id); // "1" deleted, no replies

  const map = await engagementSummary(s.author, [postT(s.post.id), postT(second.id)]);
  expect(map[`post:${s.post.id}`]).toMatchObject({
    counts: { LIKE: 2, LOVE: 1 },
    total: 3,
    mine: "LIKE",
    commentCount: 2,
  });
  expect(map[`post:${s.post.id}`].preview.map((c) => c.body)).toEqual(["2", "3"]);
  expect(map[`post:${second.id}`]).toEqual(EMPTY_ENGAGEMENT);
  expect(await engagementSummary(s.author, [])).toEqual({});

  // viewer-aware names: a sharing commenter without a name shows no email to a receptionist on posts
  await prisma.user.update({ where: { id: s.neighbor.id }, data: { shareName: true } });
  const asReceptionist = await engagementSummary(s.receptionist, [postT(s.post.id)]);
  expect(asReceptionist[`post:${s.post.id}`].preview[0].author.name).toBeNull();
});
