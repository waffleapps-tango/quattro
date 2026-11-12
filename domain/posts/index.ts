import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { maskPerson } from "@/domain/privacy/person";
import { PostKind, Role, type Membership, type Post, type Prisma } from "@/lib/generated/prisma";
import { slugify } from "@/lib/text";

const POST_STAFF: Role[] = [Role.MANAGER, Role.ADMIN];

const postInclude = {
  author: { select: { id: true, firstName: true, lastName: true, email: true, shareName: true } },
} satisfies Prisma.PostInclude;

export type PostListItem = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export type PostView = PostListItem & { pinned: boolean };

export function canPostAnnouncement(membership: Pick<Membership, "role">): boolean {
  return POST_STAFF.includes(membership.role);
}

const membershipOf = (actor: SessionUser, communityId: string) =>
  actor.memberships.find((m) => m.communityId === communityId);

export function canEditPost(
  actor: SessionUser,
  post: Pick<Post, "authorId" | "kind" | "communityId">,
): boolean {
  const m = membershipOf(actor, post.communityId);
  if (!m) return false;
  if (post.authorId === actor.id) return true;
  return post.kind === PostKind.ANNOUNCEMENT && canPostAnnouncement(m);
}

export function canDeletePost(actor: SessionUser, post: Pick<Post, "authorId" | "communityId">): boolean {
  const m = membershipOf(actor, post.communityId);
  if (!m) return false;
  return post.authorId === actor.id || canPostAnnouncement(m);
}

function requireMember(actor: SessionUser, communityId: string) {
  const m = membershipOf(actor, communityId);
  if (!m) throw new UnauthorizedError(`User ${actor.id} has no membership in community ${communityId}`);
  return m;
}

const isPinned = (p: Pick<Post, "kind" | "pinnedUntil">, now: Date) =>
  p.kind === PostKind.ANNOUNCEMENT && p.pinnedUntil !== null && p.pinnedUntil >= now;

// Names follow maskPerson; only staff ever receive another author's email (the fallback name).
function view(post: PostListItem, actor: SessionUser, isStaff: boolean, now: Date): PostView {
  let author = post.author;
  if (author && author.id !== actor.id) {
    author = maskPerson(author, actor.id);
    if (!isStaff) author = { ...author, email: "" };
  }
  return { ...post, author, pinned: isPinned(post, now) };
}

// ponytail: loads the whole community feed; add cursor pagination when it grows past a few hundred posts.
export async function listPosts(
  actor: SessionUser,
  communityId: string,
  filters: { kind?: PostKind } = {},
  now = new Date(),
): Promise<PostView[]> {
  const m = requireMember(actor, communityId);
  const rows = await prisma.post.findMany({
    where: { communityId, ...(filters.kind ? { kind: filters.kind } : {}) },
    include: postInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  const pinned = rows
    .filter((p) => isPinned(p, now))
    .sort((a, b) => a.pinnedUntil!.getTime() - b.pinnedUntil!.getTime());
  const rest = rows.filter((p) => !isPinned(p, now));
  const staff = canPostAnnouncement(m);
  return [...pinned, ...rest].map((p) => view(p, actor, staff, now));
}

export async function getPostBySlug(actor: SessionUser, slug: string, now = new Date()): Promise<PostView> {
  const post = await prisma.post.findUnique({ where: { slug }, include: postInclude });
  const m = post && membershipOf(actor, post.communityId);
  if (!post || !m) throw new NotFoundError(`Post ${slug} not found`);
  return view(post, actor, canPostAnnouncement(m), now);
}

function cleanText(input: { title: string; content: string }) {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) throw new ValidationError("title and content are required");
  return { title, content };
}

export async function createPost(
  actor: SessionUser,
  communityId: string,
  input: { kind: PostKind; title: string; content: string; pinnedUntil?: Date | null },
): Promise<Post> {
  const m = requireMember(actor, communityId);
  if (input.kind === PostKind.ANNOUNCEMENT && !canPostAnnouncement(m)) {
    throw new UnauthorizedError(`User ${actor.id} cannot post announcements`);
  }
  const { title, content } = cleanText(input);

  return prisma.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: {
        communityId,
        authorId: actor.id,
        kind: input.kind,
        title,
        content,
        published: true,
        pinnedUntil: input.kind === PostKind.ANNOUNCEMENT ? (input.pinnedUntil ?? null) : null,
        // Suffix keeps slugs unique and non-empty (titles of only Polish letters, same titles).
        slug: [slugify(title), Date.now().toString(36) + Math.random().toString(36).slice(2, 6)]
          .filter(Boolean)
          .join("-"),
      },
    });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "POST_CREATED",
      entity: "Post",
      entityId: post.id,
      metadata: { kind: post.kind },
    });
    if (post.kind === PostKind.ANNOUNCEMENT) {
      const members = await tx.membership.findMany({
        where: { communityId, userId: { not: actor.id } },
        select: { userId: true },
      });
      await notify(tx, {
        communityId,
        type: "POST_ANNOUNCEMENT",
        recipientUserIds: members.map((x) => x.userId),
        payload: { postId: post.id, slug: post.slug, title: post.title },
        dedupeKey: `POST_ANNOUNCEMENT:${post.id}`,
      });
    }
    return post;
  });
}

async function loadForWrite(actor: SessionUser, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || !membershipOf(actor, post.communityId)) throw new NotFoundError(`Post ${postId} not found`);
  return post;
}

export async function updatePost(
  actor: SessionUser,
  postId: string,
  input: { title: string; content: string; pinnedUntil?: Date | null },
): Promise<Post> {
  const post = await loadForWrite(actor, postId);
  if (!canEditPost(actor, post)) throw new UnauthorizedError(`User ${actor.id} cannot edit post ${postId}`);
  const { title, content } = cleanText(input);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.post.update({
      where: { id: postId },
      data: {
        title,
        content,
        ...(post.kind === PostKind.ANNOUNCEMENT && input.pinnedUntil !== undefined
          ? { pinnedUntil: input.pinnedUntil }
          : {}),
      },
    });
    await writeAuditLog(tx, {
      communityId: post.communityId,
      userId: actor.id,
      action: "POST_UPDATED",
      entity: "Post",
      entityId: post.id,
    });
    return updated;
  });
}

export async function deletePost(actor: SessionUser, postId: string): Promise<void> {
  const post = await loadForWrite(actor, postId);
  if (!canDeletePost(actor, post)) throw new UnauthorizedError(`User ${actor.id} cannot delete post ${postId}`);
  await prisma.$transaction(async (tx) => {
    await tx.post.delete({ where: { id: postId } });
    await writeAuditLog(tx, {
      communityId: post.communityId,
      userId: actor.id,
      action: "POST_DELETED",
      entity: "Post",
      entityId: post.id,
      metadata: { authorId: post.authorId, kind: post.kind },
    });
  });
}
