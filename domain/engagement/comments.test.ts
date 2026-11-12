import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { PostKind, Role } from "@/lib/generated/prisma";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { createPost } from "@/domain/posts";
import { createReport } from "@/domain/reports";
import { addComment, editComment, deleteComment, listComments } from "@/domain/engagement";

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

describe("comments", () => {
  it("adds comments and one level of replies, oldest first", async () => {
    const s = await setup();
    const t = postT(s.post.id);
    let thread = await addComment(s.neighbor, t, { body: "  Mogę pożyczyć  " });
    const top = thread[0];
    expect(top.body).toBe("Mogę pożyczyć");
    thread = await addComment(s.author, t, { body: "Dzięki!", parentId: top.id });
    expect(thread[0].replies.map((r) => r.body)).toEqual(["Dzięki!"]);
    const reply = thread[0].replies[0];
    await expect(addComment(s.neighbor, t, { body: "x", parentId: reply.id })).rejects.toThrow(ValidationError);
  });

  it("validates body length and cross-target parents", async () => {
    const s = await setup();
    const t = postT(s.post.id);
    await expect(addComment(s.neighbor, t, { body: "   " })).rejects.toThrow(ValidationError);
    await expect(addComment(s.neighbor, t, { body: "x".repeat(2001) })).rejects.toThrow(ValidationError);
    const otherPost = await createPost(s.author, s.community.id, { kind: PostKind.NEIGHBOR, title: "Inny", content: "c" });
    const [c] = await addComment(s.neighbor, postT(otherPost.id), { body: "tam" });
    await expect(addComment(s.neighbor, t, { body: "tu", parentId: c.id })).rejects.toThrow(ValidationError);
  });

  it("lets only the author edit; author or staff delete; placeholder only when replies exist", async () => {
    const s = await setup();
    const t = postT(s.post.id);
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    let thread = await addComment(s.neighbor, t, { body: "pierwszy" });
    const first = thread[0];
    await addComment(s.neighbor, t, { body: "drugi" });
    await addComment(s.author, t, { body: "odp", parentId: first.id });

    await expect(editComment(s.author, t, first.id, "hack")).rejects.toThrow(UnauthorizedError);
    thread = await editComment(s.neighbor, t, first.id, "pierwszy (poprawiony)");
    expect(thread[0].editedAt).not.toBeNull();

    await expect(deleteComment(s.author, t, first.id)).rejects.toThrow(UnauthorizedError); // post author is not comment author nor staff
    thread = await deleteComment(manager, t, first.id);
    expect(thread[0]).toMatchObject({ deleted: true, body: "" });
    expect(thread[0].replies).toHaveLength(1);
    const second = thread[1];
    thread = await deleteComment(s.neighbor, t, second.id);
    expect(thread).toHaveLength(1); // deleted without replies disappears
    const audit = await prisma.auditLog.findMany({ where: { action: "COMMENT_DELETED" } });
    expect(audit).toHaveLength(1); // only the staff moderation
  });

  it("keeps private report threads to the author and staff", async () => {
    const s = await setup();
    const report = await privateReport(s);
    const t = { type: "report" as const, id: report.id };
    await addComment(s.author, t, { body: "Cieknie od wczoraj" });
    const thread = await addComment(s.receptionist, t, { body: "Wyślemy hydraulika" });
    expect(thread).toHaveLength(2);
    await expect(listComments(s.neighbor, t)).rejects.toThrow(NotFoundError);
    await expect(addComment(s.neighbor, t, { body: "x" })).rejects.toThrow(NotFoundError);
  });

  it("notifies the target author and the parent author, never the commenter", async () => {
    const s = await setup();
    const t = postT(s.post.id);
    const [top] = await addComment(s.neighbor, t, { body: "Mam cukier" });
    await addComment(s.author, t, { body: "Super", parentId: top.id }); // author replies: notify neighbor only
    await addComment(s.author, t, { body: "Jeszcze ja" }); // author comments on own post: nobody
    const rows = await prisma.notification.findMany({ where: { type: "COMMENT_ADDED" }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.recipientUserId, (r.payload as { kind: string }).kind])).toEqual([
      [s.author.id, "comment"],
      [s.neighbor.id, "reply"],
    ]);
  });

  it("masks names and hides emails from residents", async () => {
    const s = await setup();
    const t = postT(s.post.id);
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const nameOf = async (viewer: typeof s.author) => (await listComments(viewer, t))[0].author.name;

    await prisma.user.update({ where: { id: s.neighbor.id }, data: { shareName: false } });
    await addComment(s.neighbor, t, { body: "anonimowo" });
    expect(await nameOf(s.author)).toBe("Mieszkaniec");

    // shared name but no first/last name: residents get null, staff and the author see the email
    await prisma.user.update({ where: { id: s.neighbor.id }, data: { shareName: true, firstName: null, lastName: null } });
    expect(await nameOf(s.author)).toBeNull();
    expect(await nameOf(manager)).toBe(s.neighbor.email);
    expect(await nameOf(s.neighbor)).toBe(s.neighbor.email);

    await prisma.user.update({ where: { id: s.neighbor.id }, data: { firstName: "Jan", lastName: "Kowalski" } });
    for (const v of [s.author, manager, s.neighbor]) expect(await nameOf(v)).toBe("Jan Kowalski");
  });

  it("rejects comment ids from another target", async () => {
    const s = await setup();
    const postB = await createPost(s.author, s.community.id, { kind: PostKind.NEIGHBOR, title: "B", content: "c" });
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const [a] = await addComment(s.neighbor, postT(s.post.id), { body: "na A" });
    await expect(editComment(s.neighbor, postT(postB.id), a.id, "x")).rejects.toThrow(NotFoundError);
    await expect(deleteComment(manager, postT(postB.id), a.id)).rejects.toThrow(NotFoundError);

    const report = await privateReport(s);
    const [pc] = await addComment(s.author, { type: "report", id: report.id }, { body: "prywatne" });
    await expect(deleteComment(s.neighbor, postT(s.post.id), pc.id)).rejects.toThrow(NotFoundError);
    expect((await prisma.comment.findUnique({ where: { id: pc.id } }))?.deletedAt).toBeNull();
  });

  it("omits deleted replies and refuses to edit deleted comments", async () => {
    const s = await setup();
    const t = postT(s.post.id);
    const [top] = await addComment(s.neighbor, t, { body: "góra" });
    const thread = await addComment(s.author, t, { body: "odp", parentId: top.id });
    const reply = thread[0].replies[0];
    expect((await deleteComment(s.author, t, reply.id))[0].replies).toHaveLength(0);
    expect((await listComments(s.neighbor, t))[0].replies).toHaveLength(0);
    await expect(editComment(s.author, t, reply.id, "x")).rejects.toThrow(ValidationError);
  });
});
