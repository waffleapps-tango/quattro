import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { PostKind, Role } from "@/lib/generated/prisma";
import { NotFoundError, UnauthorizedError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import {
  canPostAnnouncement,
  createPost,
  deletePost,
  getPostBySlug,
  listPosts,
  updatePost,
} from "@/domain/posts";

afterEach(async () => {
  await cleanupDatabase();
});

async function setup() {
  const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
  const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });
  const receptionist = await createUserWithMembership({ communityId: community.id, role: Role.RECEPTIONIST });
  const resident = await createUserWithMembership({
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
  return { community, manager, receptionist, resident, neighbor };
}
const input = (kind: PostKind, extra: { title?: string; pinnedUntil?: Date | null } = {}) => ({
  kind,
  title: extra.title ?? "Tytuł",
  content: "Treść",
  pinnedUntil: extra.pinnedUntil,
});
const DAY = 24 * 60 * 60 * 1000;

describe("canPostAnnouncement", () => {
  it("allows managers and admins only", () => {
    expect(canPostAnnouncement({ role: Role.MANAGER })).toBe(true);
    expect(canPostAnnouncement({ role: Role.ADMIN })).toBe(true);
    expect(canPostAnnouncement({ role: Role.RECEPTIONIST })).toBe(false);
    expect(canPostAnnouncement({ role: Role.RESIDENT })).toBe(false);
  });
});

describe("createPost", () => {
  it("lets any member write a neighbor post and only staff an announcement", async () => {
    const s = await setup();
    const own = await createPost(s.resident, s.community.id, input(PostKind.NEIGHBOR));
    expect(own.authorId).toBe(s.resident.id);
    expect(own.communityId).toBe(s.community.id);

    await expect(createPost(s.resident, s.community.id, input(PostKind.ANNOUNCEMENT))).rejects.toThrow(UnauthorizedError);
    await expect(createPost(s.receptionist, s.community.id, input(PostKind.ANNOUNCEMENT))).rejects.toThrow(UnauthorizedError);
    const ann = await createPost(s.manager, s.community.id, input(PostKind.ANNOUNCEMENT));
    expect(ann.kind).toBe(PostKind.ANNOUNCEMENT);
  });

  it("drops pinnedUntil on neighbor posts and keeps it on announcements", async () => {
    const s = await setup();
    const until = new Date(Date.now() + 3 * DAY);
    const n = await createPost(s.resident, s.community.id, input(PostKind.NEIGHBOR, { pinnedUntil: until }));
    expect(n.pinnedUntil).toBeNull();
    const a = await createPost(s.manager, s.community.id, input(PostKind.ANNOUNCEMENT, { pinnedUntil: until }));
    expect(a.pinnedUntil?.getTime()).toBe(until.getTime());
  });

  it("rejects a non-member", async () => {
    const s = await setup();
    const other = await createCommunityWithBuildingAndApartment();
    await expect(createPost(s.resident, other.community.id, input(PostKind.NEIGHBOR))).rejects.toThrow(UnauthorizedError);
  });

  it("notifies every other member about an announcement, nobody about a neighbor post", async () => {
    const s = await setup();
    await createPost(s.resident, s.community.id, input(PostKind.NEIGHBOR));
    expect(await prisma.notification.count()).toBe(0);

    const ann = await createPost(s.manager, s.community.id, input(PostKind.ANNOUNCEMENT, { title: "Próby pożarowe" }));
    const rows = await prisma.notification.findMany({ where: { type: "POST_ANNOUNCEMENT" } });
    expect(rows.map((r) => r.recipientUserId).sort()).toEqual(
      [s.receptionist.id, s.resident.id, s.neighbor.id].sort(),
    );
    expect(rows[0].payload).toEqual({ postId: ann.id, slug: ann.slug, title: "Próby pożarowe" });
  });
});

describe("listPosts", () => {
  it("puts active pins first, then everything by date, and filters by kind", async () => {
    const s = await setup();
    const now = new Date();
    const expired = await createPost(s.manager, s.community.id, input(PostKind.ANNOUNCEMENT, { pinnedUntil: new Date(now.getTime() - DAY) }));
    const neighborPost = await createPost(s.resident, s.community.id, input(PostKind.NEIGHBOR));
    const plain = await createPost(s.manager, s.community.id, input(PostKind.ANNOUNCEMENT));
    const pinLater = await createPost(s.manager, s.community.id, input(PostKind.ANNOUNCEMENT, { pinnedUntil: new Date(now.getTime() + 5 * DAY) }));
    const pinSooner = await createPost(s.manager, s.community.id, input(PostKind.ANNOUNCEMENT, { pinnedUntil: new Date(now.getTime() + 2 * DAY) }));
    // deterministic creation order, oldest -> newest; plain is newer than both pins
    const order = [pinLater, expired, neighborPost, pinSooner, plain];
    for (const [i, p] of order.entries()) {
      await prisma.post.update({ where: { id: p.id }, data: { createdAt: new Date(now.getTime() - (10 - i) * 60_000) } });
    }

    const list = await listPosts(s.resident, s.community.id, {}, now);
    expect(list.map((p) => p.id)).toEqual([pinSooner.id, pinLater.id, plain.id, neighborPost.id, expired.id]);
    expect(list.map((p) => p.pinned)).toEqual([true, true, false, false, false]);

    const onlyNeighbor = await listPosts(s.resident, s.community.id, { kind: PostKind.NEIGHBOR }, now);
    expect(onlyNeighbor.map((p) => p.id)).toEqual([neighborPost.id]);
  });

  it("never shows another community's posts and rejects non-members", async () => {
    const s = await setup();
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });
    const foreign = await createPost(outsider, other.community.id, input(PostKind.ANNOUNCEMENT));

    expect(await listPosts(s.resident, s.community.id)).toHaveLength(0);
    await expect(listPosts(s.resident, other.community.id)).rejects.toThrow(UnauthorizedError);
    await expect(getPostBySlug(s.resident, foreign.slug)).rejects.toThrow(NotFoundError);
  });

  it("masks hidden names and never gives residents another author's email", async () => {
    const s = await setup();
    await prisma.user.update({ where: { id: s.neighbor.id }, data: { firstName: "Jan", lastName: "Nowak" } });
    const post = await createPost(s.neighbor, s.community.id, input(PostKind.NEIGHBOR));

    const [visible] = await listPosts(s.resident, s.community.id);
    expect(visible.author?.firstName).toBe("Jan");
    expect(visible.author?.email).toBe("");

    await prisma.user.update({ where: { id: s.neighbor.id }, data: { shareName: false } });
    const masked = await getPostBySlug(s.resident, post.slug);
    expect(masked.author?.firstName).not.toBe("Jan");
    expect(masked.author?.lastName).toBeNull();
    expect(masked.author?.email).toBe("");
  });
});

describe("updatePost / deletePost", () => {
  it("lets the author edit and delete their own post", async () => {
    const s = await setup();
    const post = await createPost(s.resident, s.community.id, input(PostKind.NEIGHBOR));
    const updated = await updatePost(s.resident, post.id, { title: "Nowy", content: "Nowa treść" });
    expect(updated.title).toBe("Nowy");
    await deletePost(s.resident, post.id);
    expect(await prisma.post.count()).toBe(0);
  });

  it("stops other residents; staff may delete any post but edit only announcements", async () => {
    const s = await setup();
    const post = await createPost(s.resident, s.community.id, input(PostKind.NEIGHBOR));
    await expect(updatePost(s.neighbor, post.id, { title: "x", content: "y" })).rejects.toThrow(UnauthorizedError);
    await expect(deletePost(s.neighbor, post.id)).rejects.toThrow(UnauthorizedError);
    await expect(updatePost(s.manager, post.id, { title: "x", content: "y" })).rejects.toThrow(UnauthorizedError);

    const otherManager = await createUserWithMembership({ communityId: s.community.id, role: Role.ADMIN });
    const ann = await createPost(otherManager, s.community.id, input(PostKind.ANNOUNCEMENT));
    const edited = await updatePost(s.manager, ann.id, { title: "Zmienione", content: "z", pinnedUntil: null });
    expect(edited.title).toBe("Zmienione");

    await deletePost(s.manager, post.id);
    expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();
    const audit = await prisma.auditLog.findMany({ where: { entity: "Post", entityId: post.id } });
    expect(audit.map((a) => a.action).sort()).toEqual(["POST_CREATED", "POST_DELETED"]);
  });

  it("treats a post of another community as not found", async () => {
    const s = await setup();
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });
    const foreign = await createPost(outsider, other.community.id, input(PostKind.ANNOUNCEMENT));
    await expect(deletePost(s.manager, foreign.id)).rejects.toThrow(NotFoundError);
  });
});
