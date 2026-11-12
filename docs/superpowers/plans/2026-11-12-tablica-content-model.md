# Tablica Content Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/posts` becomes "Tablica": community-scoped HOA announcements (staff, pinned until a date, notify everyone) plus neighbor posts (any member), all rendered through one shared `FeedCard` that report cards also use.

**Architecture:** `Post` gains `communityId`, `authorId`, `kind`, `pinnedUntil`. All Post access moves into `domain/posts` (list/get/create/update/delete with permissions, audit and notifications); pages and server actions become thin. A presentational `FeedCard` (eyebrow, badges, title, meta, body, footer slot) replaces the card markup in posts and reports so piece 2 (reactions/comments) can plug into the footer.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + Postgres, next-intl, zod, vitest, shadcn/Radix UI.

Spec: `docs/superpowers/specs/2026-11-12-tablica-content-model-design.md`

## Global Constraints

- "Staff" for posts = `MANAGER` or `ADMIN`. Receptionists are treated as residents for posts.
- `PostKind` values: `ANNOUNCEMENT`, `NEIGHBOR`. Default `ANNOUNCEMENT` (for backfilled rows).
- `pinnedUntil` is honoured only for `ANNOUNCEMENT`; it is forced to `null` for `NEIGHBOR`.
- Feed order: active pins (`pinnedUntil >= now`) first by `pinnedUntil` asc, then all others by `createdAt` desc (tiebreak `id` asc). A pinned post is not repeated.
- Author may edit and delete their own post. Staff may delete any post and edit announcements. Nobody changes `kind` after creation.
- New announcement notifies every member of the community except its author: type `POST_ANNOUNCEMENT`, payload `{ postId, slug, title }`, dedupeKey `POST_ANNOUNCEMENT:<postId>`.
- Posts from another community: list never includes them; get-by-slug throws `NotFoundError`.
- Author identity: `maskPerson` rules; non-staff viewers never receive another user's email.
- URL stays `/posts`; nav label "Tablica" (pl) / "Board" (en). Filter param `?kind=announcement|neighbor`.
- Every user-visible string in both `messages/pl.json` and `messages/en.json`.
- **Tests wipe the database** (`cleanupDatabase`). Run vitest and `prisma migrate dev` only against the local Docker Postgres (`.env` → `localhost:5432`). Never load `.env.gcp`, never run `*:gcp` scripts. Applying the migration to Cloud SQL is a manual step for the user.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Precondition (controller, before Task 1):** the working tree has uncommitted card restyles (reports single column, `components/posts/PostCard.tsx`, `ReportCard.tsx`, info cards). Commit them first so this plan starts from a clean tree.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `PostKind`, new Post columns/relations |
| `prisma/migrations/<ts>_tablica_posts/migration.sql` (create) | Columns, backfill, FKs, index |
| `domain/__test-helpers__/fixtures.ts` (modify) | `cleanupDatabase` deletes posts |
| `domain/posts/index.ts` (rewrite) | Permissions, list/get/create/update/delete |
| `domain/posts/index.test.ts` (rewrite) | Domain tests |
| `domain/audit/log.ts` (modify) | `POST_CREATED`/`POST_UPDATED`/`POST_DELETED` actions |
| `domain/notifications/types.ts` (modify) | `POST_ANNOUNCEMENT` type |
| `actions/actions.ts` (rewrite post actions) | Thin wrappers over the domain |
| `components/feed/FeedCard.tsx` (create) | Shared card shell |
| `components/posts/PostCard.tsx` (rewrite) | Post on FeedCard (kind eyebrow, pin badge, author) |
| `components/reports/ReportCard.tsx` (modify) | Report on FeedCard |
| `components/posts/PostFields.tsx`, `CreatePostForm.tsx`, `EditPostForm.tsx`, `DeletePostButton.tsx` (modify) | Kind + pin fields, permission-aware |
| `app/posts/page.tsx`, `app/posts/[slug]/page.tsx` (modify) | Use domain, chips, permissions |
| `components/notifications/NotificationBell.tsx` (modify) | Link `POST_ANNOUNCEMENT` to the post |
| `messages/pl.json`, `messages/en.json` (modify) | New strings |

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_tablica_posts/migration.sql`
- Modify: `domain/__test-helpers__/fixtures.ts`

**Interfaces:**
- Produces: Prisma `Post` fields `communityId: string`, `authorId: string | null`, `kind: PostKind`, `pinnedUntil: Date | null`; relations `post.community`, `post.author`; enum `PostKind` exported from `@/lib/generated/prisma`.

- [ ] **Step 1: Verify the local DB target.** Run `grep '^DATABASE_URL' .env && docker ps --format '{{.Names}}' | grep postgres`. Expected: URL with `localhost:5432` and `quattro-postgres-1`. Stop if not.

- [ ] **Step 2: Edit `prisma/schema.prisma`.** Replace the `Post` model and add the enum:

```prisma
enum PostKind {
  ANNOUNCEMENT
  NEIGHBOR
}

model Post {
  id          String    @id @default(cuid())
  communityId String
  authorId    String?
  kind        PostKind  @default(ANNOUNCEMENT)
  title       String
  slug        String    @unique
  content     String
  published   Boolean?  @default(false)
  pinnedUntil DateTime?
  updatedAt   DateTime  @updatedAt
  createdAt   DateTime  @default(now())

  community Community @relation(fields: [communityId], references: [id])
  author    User?     @relation("PostAuthor", fields: [authorId], references: [id], onDelete: SetNull)

  @@index([communityId, kind, createdAt])
}
```

Add back-relations: in `model Community` add `posts Post[]`; in `model User` add `posts Post[] @relation("PostAuthor")`.

- [ ] **Step 3: Create the migration without applying it.**

Run: `npx prisma migrate dev --create-only --name tablica_posts`
Then replace the generated `migration.sql` content with exactly:

```sql
-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('ANNOUNCEMENT', 'NEIGHBOR');

-- AlterTable: add nullable first so existing rows can be backfilled
ALTER TABLE "Post"
  ADD COLUMN "communityId" TEXT,
  ADD COLUMN "authorId" TEXT,
  ADD COLUMN "kind" "PostKind" NOT NULL DEFAULT 'ANNOUNCEMENT',
  ADD COLUMN "pinnedUntil" TIMESTAMP(3);

-- Backfill: posts used to be global; they belong to the (single) oldest community.
-- If posts exist but no community does, SET NOT NULL below fails loudly on purpose.
UPDATE "Post"
SET "communityId" = (SELECT "id" FROM "Community" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "communityId" IS NULL;

ALTER TABLE "Post" ALTER COLUMN "communityId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Post_communityId_kind_createdAt_idx" ON "Post"("communityId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply locally and check for drift.**

Run: `npx prisma migrate dev` (applies to the local DB and regenerates the client). Then run `npx prisma migrate dev --create-only --name drift_check`.
Expected: the second command reports no schema changes (if it creates an empty or non-empty migration folder, inspect it: non-empty means the SQL above does not match the schema; fix and delete the `drift_check` folder either way).

- [ ] **Step 5: Teach the cleanup about posts.** In `domain/__test-helpers__/fixtures.ts`, inside `cleanupDatabase`, add `await prisma.post.deleteMany();` right after `await prisma.package.deleteMany();` (posts reference community and user, which are deleted later).

- [ ] **Step 6: Typecheck.** Run `npx tsc --noEmit`. Expected failures only in files that create posts without `communityId` (`actions/actions.ts`); those are rewritten in Task 3. Note them in the report.

- [ ] **Step 7: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations domain/__test-helpers__/fixtures.ts
git commit -m "feat: posts belong to a community, have an author, kind and pin date"
```

---

### Task 2: Posts domain

**Files:**
- Rewrite: `domain/posts/index.ts`
- Rewrite: `domain/posts/index.test.ts`
- Modify: `domain/audit/log.ts`, `domain/notifications/types.ts`
- Modify: `messages/pl.json`, `messages/en.json` (notification text only)

**Interfaces:**
- Consumes: Task 1 schema.
- Produces (exact names, used by Tasks 3-5):
  - `canPostAnnouncement(membership: Pick<Membership, "role">): boolean`
  - `canEditPost(actor: SessionUser, post: Pick<Post, "authorId" | "kind" | "communityId">): boolean`
  - `canDeletePost(actor: SessionUser, post: Pick<Post, "authorId" | "communityId">): boolean`
  - `type PostView = PostListItem & { pinned: boolean }` where `PostListItem = Prisma.PostGetPayload<{ include: typeof postInclude }>` and `postInclude = { author: { select: { id, firstName, lastName, email, shareName } } }`
  - `listPosts(actor, communityId, filters?: { kind?: PostKind }, now?: Date): Promise<PostView[]>`
  - `getPostBySlug(actor, slug, now?: Date): Promise<PostView>`
  - `createPost(actor, communityId, input: { kind: PostKind; title: string; content: string; pinnedUntil?: Date | null }): Promise<Post>`
  - `updatePost(actor, postId, input: { title: string; content: string; pinnedUntil?: Date | null }): Promise<Post>`
  - `deletePost(actor, postId): Promise<void>`
  - Notification type `POST_ANNOUNCEMENT` with payload `{ postId: string; slug: string; title: string }`.

- [ ] **Step 1: Write the failing tests.** Replace `domain/posts/index.test.ts` with:

```ts
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
    // deterministic creation order: expired oldest ... pinSooner newest
    const order = [expired, neighborPost, plain, pinLater, pinSooner];
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
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run domain/posts` → FAIL (missing exports).

- [ ] **Step 3: Audit actions and notification type.**

In `domain/audit/log.ts` add `| "POST_CREATED" | "POST_UPDATED" | "POST_DELETED"` to `AuditAction`.

In `domain/notifications/types.ts` add above `NOTIFICATION_TYPES`:

```ts
const postAnnouncementPayload = z.object({
  postId: z.string(),
  slug: z.string(),
  title: z.string(),
});
```

and the entry `POST_ANNOUNCEMENT: postAnnouncementPayload,` in `NOTIFICATION_TYPES`.

Add the texts (script; verify `git diff --numstat messages/` shows no real deletions):

```bash
python3 - <<'EOF'
import json
add = {
  "pl": {"title": "Nowe ogłoszenie", "body": "„{title}”"},
  "en": {"title": "New announcement", "body": "“{title}”"},
}
for loc, v in add.items():
    p = f"messages/{loc}.json"
    d = json.load(open(p))
    d["notifications"]["types"]["POST_ANNOUNCEMENT"] = v
    open(p, "w").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
EOF
```

- [ ] **Step 4: Implement `domain/posts/index.ts`** (replace the file):

```ts
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
```

If `NotFoundError`/`ValidationError` constructors or `maskPerson`'s signature differ from this usage, adapt minimally and say so in the report.

- [ ] **Step 5: Run to verify it passes.** `npx vitest run domain/posts` → PASS (all tests above).

- [ ] **Step 6: Commit.**

```bash
git add domain/posts domain/audit/log.ts domain/notifications/types.ts messages
git commit -m "feat: posts domain with kinds, pins, permissions and announcement notifications"
```

---

### Task 3: Server actions and post forms

**Files:**
- Modify: `actions/actions.ts` (the three post actions)
- Modify: `components/posts/PostFields.tsx`, `CreatePostForm.tsx`, `EditPostForm.tsx`, `DeletePostButton.tsx` (only if it needs nothing: leave)
- Modify: `messages/pl.json`, `messages/en.json`

**Interfaces:**
- Consumes: Task 2 domain functions.
- Produces: `CreatePostForm({ canAnnounce }: { canAnnounce: boolean })`; `EditPostForm({ post })` where `post` has `id, title, content, createdAt, kind, pinnedUntil`; form field names `title`, `content`, `kind` (`ANNOUNCEMENT`|`NEIGHBOR`), `pinnedUntil` (`YYYY-MM-DD` or empty), `id` (edit only).

- [ ] **Step 1: Strings.** Add under `posts` (pl / en):

```bash
python3 - <<'EOF'
import json
add = {
 "pl": {
  "kind": {"ANNOUNCEMENT": "Ogłoszenie", "NEIGHBOR": "Sąsiedzi"},
  "kindLabel": "Rodzaj",
  "kindNeighborOption": "Wiadomość do sąsiadów",
  "kindAnnouncementOption": "Ogłoszenie zarządu",
  "pinnedUntilLabel": "Przypięte do (opcjonalnie)",
  "pinnedUntilHint": "Do tego dnia ogłoszenie jest na górze tablicy.",
  "pinnedBadge": "Przypięte do {date}",
  "boardAuthor": "Ogłoszenie zarządu",
  "neighborFallback": "Sąsiad",
  "filterAll": "Wszystko",
  "filterAnnouncements": "Ogłoszenia",
  "filterNeighbors": "Sąsiedzi",
  "emptyNeighbors": "Brak wiadomości od sąsiadów. Napisz pierwszą: zapytaj, zaproponuj, podziel się."
 },
 "en": {
  "kind": {"ANNOUNCEMENT": "Announcement", "NEIGHBOR": "Neighbors"},
  "kindLabel": "Type",
  "kindNeighborOption": "Message to neighbors",
  "kindAnnouncementOption": "Board announcement",
  "pinnedUntilLabel": "Pinned until (optional)",
  "pinnedUntilHint": "Until this day the announcement stays on top of the board.",
  "pinnedBadge": "Pinned until {date}",
  "boardAuthor": "Board announcement",
  "neighborFallback": "Neighbor",
  "filterAll": "All",
  "filterAnnouncements": "Announcements",
  "filterNeighbors": "Neighbors",
  "emptyNeighbors": "No messages from neighbors yet. Write the first one: ask, offer, share."
 }
}
for loc, keys in add.items():
    p = f"messages/{loc}.json"
    d = json.load(open(p))
    d["posts"].update(keys)
    open(p, "w").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
EOF
git diff --numstat messages/
```

Expected: additions only (one "deletion" per file for a trailing comma is fine).

- [ ] **Step 2: Rewrite the post actions in `actions/actions.ts`** (keep the exported names `createPost`, `updatePost`, `deletePost` and their return shapes; other exports in the file, if any, stay):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import * as posts from "@/domain/posts";
import { dispatchPending } from "@/domain/notifications/dispatch";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { PostKind } from "@/lib/generated/prisma";

const postSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  kind: z.nativeEnum(PostKind).default(PostKind.NEIGHBOR),
  pinnedUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// "YYYY-MM-DD" from <input type="date"> means "until the end of that day" in Poland.
// ponytail: fixed +01:00 (CET); during CEST the pin ends an hour later, harmless.
const endOfDay = (d: string | undefined) => (d ? new Date(`${d}T23:59:59+01:00`) : null);

type State = { message: string; success?: boolean };

async function failure(error: unknown, fallbackKey: "createFailed" | "updateFailed" | "deleteFailed"): Promise<State> {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  if (error instanceof UnauthorizedError || error instanceof NotFoundError) return { message: te("forbidden"), success: false };
  if (error instanceof ValidationError) return { message: te("invalidForm"), success: false };
  console.error(error);
  return { message: t(fallbackKey), success: false };
}

export async function createPost(_prev: State, formData: FormData): Promise<State> {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  const communityId = actor?.memberships[0]?.communityId; // ponytail: first membership, as on every page
  if (!actor || !communityId) return { message: te("forbidden"), success: false };
  const parsed = postSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    kind: formData.get("kind") ?? undefined,
    pinnedUntil: formData.get("pinnedUntil") ?? undefined,
  });
  if (!parsed.success) return { message: te("invalidForm"), success: false };
  try {
    await posts.createPost(actor, communityId, { ...parsed.data, pinnedUntil: endOfDay(parsed.data.pinnedUntil) });
    revalidatePath("/posts");
    after(() => dispatchPending().catch(console.error));
    return { message: t("created"), success: true };
  } catch (error) {
    return failure(error, "createFailed");
  }
}

export async function updatePost(_prev: State, formData: FormData): Promise<State> {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("forbidden"), success: false };
  const parsed = postSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    pinnedUntil: formData.get("pinnedUntil") ?? undefined,
  });
  if (!parsed.success) return { message: te("invalidForm"), success: false };
  try {
    const post = await posts.updatePost(actor, String(formData.get("id")), {
      title: parsed.data.title,
      content: parsed.data.content,
      // field absent (neighbor post form) → leave the pin alone
      pinnedUntil: formData.has("pinnedUntil") ? endOfDay(parsed.data.pinnedUntil) : undefined,
    });
    revalidatePath("/posts");
    revalidatePath(`/posts/${post.slug}`);
    return { message: t("updated"), success: true };
  } catch (error) {
    return failure(error, "updateFailed");
  }
}

export async function deletePost(postId: string): Promise<State> {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("forbidden"), success: false };
  try {
    await posts.deletePost(actor, postId);
    revalidatePath("/posts");
    return { message: t("deleted"), success: true };
  } catch (error) {
    return failure(error, "deleteFailed");
  }
}
```

Check `dispatchPending`'s import path and `after` usage against `actions/packages.ts` (same pattern there). If `actions/actions.ts` contains other exported actions, keep them unchanged.

- [ ] **Step 3: `PostFields` gains kind and pin fields.** New props and markup (keep the existing title/content block unchanged, add above it):

```tsx
export function PostFields({
  defaultTitle = "",
  defaultContent = "",
  canAnnounce = false,
  kind,
  defaultPinnedUntil,
}: {
  defaultTitle?: string;
  defaultContent?: string;
  /** Create form for staff: show the kind choice. */
  canAnnounce?: boolean;
  /** Edit form: the fixed kind of the post (no choice). */
  kind?: "ANNOUNCEMENT" | "NEIGHBOR";
  defaultPinnedUntil?: Date | null;
}) {
  const t = useTranslations("posts");
  const [length, setLength] = useState(defaultContent.length);
  const [selectedKind, setSelectedKind] = useState<"ANNOUNCEMENT" | "NEIGHBOR">(
    kind ?? (canAnnounce ? "ANNOUNCEMENT" : "NEIGHBOR"),
  );
  const pinnedDefault = defaultPinnedUntil ? new Date(defaultPinnedUntil).toISOString().slice(0, 10) : "";

  return (
    <div className="space-y-4 py-4">
      {!kind && (
        canAnnounce ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("kindLabel")}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["ANNOUNCEMENT", "NEIGHBOR"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    checked={selectedKind === k}
                    onChange={() => setSelectedKind(k)}
                  />
                  {k === "ANNOUNCEMENT" ? t("kindAnnouncementOption") : t("kindNeighborOption")}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <input type="hidden" name="kind" value="NEIGHBOR" />
        )
      )}
      {selectedKind === "ANNOUNCEMENT" && (
        <div className="space-y-2">
          <label htmlFor="pinnedUntil" className="text-sm font-medium">{t("pinnedUntilLabel")}</label>
          <Input id="pinnedUntil" name="pinnedUntil" type="date" defaultValue={pinnedDefault} className="w-48" />
          <p className="text-xs text-muted-foreground">{t("pinnedUntilHint")}</p>
        </div>
      )}
      {/* existing title + content fields unchanged */}
```

- [ ] **Step 4: Forms.**
  - `CreatePostForm` takes `{ canAnnounce }: { canAnnounce: boolean }` and renders `<PostFields canAnnounce={canAnnounce} />`. The trigger button stays visible for every member (page decides).
  - `EditPostForm`'s `post` prop type adds `kind: "ANNOUNCEMENT" | "NEIGHBOR"; pinnedUntil: Date | null` and renders `<PostFields defaultTitle={post.title} defaultContent={post.content} kind={post.kind} defaultPinnedUntil={post.pinnedUntil} />`.
  - `DeletePostButton` needs no change.

- [ ] **Step 5: Typecheck and lint.** `npx tsc --noEmit` (remaining errors may only be in `app/posts/*` which Task 5 rewrites; list them) and `npx eslint actions components/posts`.

- [ ] **Step 6: Commit.**

```bash
git add actions/actions.ts components/posts messages
git commit -m "feat: post actions use the domain; forms pick kind and pin date"
```

---

### Task 4: Shared FeedCard; posts and reports on it

**Files:**
- Create: `components/feed/FeedCard.tsx`
- Rewrite: `components/posts/PostCard.tsx`
- Modify: `components/reports/ReportCard.tsx`

**Interfaces:**
- Consumes: `PostView` (Task 2), `posts.*` strings (Task 3).
- Produces:
  - `FeedCard({ eyebrow?, badges?, title, date, meta?, highlighted?, children, footer?, className? })` with `date: Date`, all slots `React.ReactNode`. No `"use client"`; works in server and client components.
  - `PostCard({ post, clamp?, className?, footer? })` where `post: Pick<PostView, "title" | "content" | "createdAt" | "kind" | "pinned" | "pinnedUntil" | "author">`.

- [ ] **Step 1: Create `components/feed/FeedCard.tsx`:**

```tsx
import { CalendarDays } from "lucide-react";
import { useFormatter } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// One card shape for everything on the boards (posts, reports). The footer slot is where
// reactions and comments plug in.
export function FeedCard({
  eyebrow,
  badges,
  title,
  date,
  meta,
  highlighted,
  children,
  footer,
  className,
}: {
  eyebrow?: React.ReactNode;
  badges?: React.ReactNode;
  title: React.ReactNode;
  date: Date;
  meta?: React.ReactNode;
  highlighted?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const format = useFormatter();
  const when = new Date(date);
  return (
    <Card className={cn("gap-6", highlighted && "border-primary/40 bg-primary/[0.03]", className)}>
      <CardHeader className="gap-2">
        {(eyebrow || badges) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {eyebrow && (
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p>
            )}
            {badges}
          </div>
        )}
        <CardTitle className="font-heading text-2xl leading-tight sm:text-3xl">{title}</CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <time dateTime={when.toISOString()} className="tabular-nums">
              {format.dateTime(when, { dateStyle: "long" })}
            </time>
          </span>
          {meta}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-6">{children}</CardContent>
      {footer && <div className="border-t px-6 pt-4">{footer}</div>}
    </Card>
  );
}
```

- [ ] **Step 2: Rewrite `components/posts/PostCard.tsx` on FeedCard:**

```tsx
import { UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { FeedCard } from "@/components/feed/FeedCard";
import { cn } from "@/lib/utils";
import type { PostView } from "@/domain/posts";

type PostCardPost = Pick<PostView, "title" | "content" | "createdAt" | "kind" | "pinned" | "pinnedUntil" | "author">;

export function PostCard({
  post,
  clamp,
  className,
  footer,
}: {
  post: PostCardPost;
  clamp?: boolean;
  className?: string;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("posts");
  const format = useFormatter();
  const a = post.author;
  const authorName =
    post.kind === "ANNOUNCEMENT"
      ? t("boardAuthor")
      : (a && ([a.firstName, a.lastName].filter(Boolean).join(" ") || a.email)) || t("neighborFallback");
  return (
    <FeedCard
      eyebrow={t(`kind.${post.kind}`)}
      badges={
        post.pinned && post.pinnedUntil ? (
          <Badge variant="info" className="ml-auto">
            {t("pinnedBadge", { date: format.dateTime(new Date(post.pinnedUntil), { dateStyle: "medium" }) })}
          </Badge>
        ) : null
      }
      title={post.title}
      date={post.createdAt}
      meta={
        <span className="flex items-center gap-1.5">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          {authorName}
        </span>
      }
      highlighted={post.pinned}
      className={className}
      footer={footer}
    >
      <p className={cn("whitespace-pre-line text-base leading-relaxed", clamp && "line-clamp-6")}>{post.content}</p>
    </FeedCard>
  );
}
```

If `Badge` has no `info` variant, use the one `PackageRow` uses for `READY_FOR_PICKUP` (it is `info` there).

- [ ] **Step 3: `ReportCard` on FeedCard.** Keep all logic (status actions, transitions, motion badge, loader overlay) and replace only the returned JSX shell: badges (urgent/type/category/private + animated status with `className="ml-auto"`) go into `badges`; `title={report.title}`; `date={report.createdAt}`; `meta` = the existing place `<span>` with `MapPin` when `place.length > 0`; children = description (`line-clamp-6 whitespace-pre-line text-base leading-relaxed`) and the "reportedBy" line; `footer` = the status action buttons when `actions.length > 0`. Keep the `isUpdating` overlay by wrapping the FeedCard in `<div className="relative">` and rendering the overlay as a sibling. Remove now-unused imports (`Card*`, `CalendarDays`).

- [ ] **Step 4: Typecheck and lint.** `npx tsc --noEmit` (only `app/posts/*` errors may remain until Task 5) and `npx eslint components/feed components/posts components/reports`.

- [ ] **Step 5: Commit.**

```bash
git add components/feed components/posts/PostCard.tsx components/reports/ReportCard.tsx
git commit -m "feat: shared FeedCard shell for posts and reports"
```

---

### Task 5: Tablica pages, navigation and bell link

**Files:**
- Modify: `app/posts/page.tsx`, `app/posts/[slug]/page.tsx`
- Modify: `components/notifications/NotificationBell.tsx`
- Modify: `messages/pl.json`, `messages/en.json` (nav/meta/heading)

**Interfaces:**
- Consumes: Tasks 2-4.

- [ ] **Step 1: Strings.** Set `nav.posts` and `meta.posts` to "Tablica" / "Board"; `posts.heading` to "Tablica ({count})" / "Board ({count})"; `posts.description` to "Ogłoszenia zarządu i wiadomości od sąsiadów." / "Board announcements and messages from neighbors."; `posts.back` to "Wróć do tablicy" / "Back to the board". Use the same python json approach; check `git diff messages/` shows only these values changed.

- [ ] **Step 2: `app/posts/page.tsx`.** Replace the prisma calls with the domain and add chips:

```tsx
export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const t = await getTranslations("posts");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const { kind: kindParam } = await searchParams;
  const kind =
    kindParam === "announcement" ? PostKind.ANNOUNCEMENT : kindParam === "neighbor" ? PostKind.NEIGHBOR : undefined;
  const posts = await listPosts(user, membership.communityId, { kind });
  const canAnnounce = canPostAnnouncement(membership);
  const chips = [
    { href: "/posts", label: t("filterAll"), active: !kind },
    { href: "/posts?kind=announcement", label: t("filterAnnouncements"), active: kind === PostKind.ANNOUNCEMENT },
    { href: "/posts?kind=neighbor", label: t("filterNeighbors"), active: kind === PostKind.NEIGHBOR },
  ];
  // ... header unchanged except: heading count = posts.length, and
  //     {<CreatePostForm canAnnounce={canAnnounce} />} for every member.
  // Chips row under the header:
  //   <nav aria-label={t("kindLabel")} className="mb-4 inline-flex gap-1 rounded-xl bg-muted p-1">
  //     {chips.map((c) => (
  //       <Button key={c.href} asChild size="sm" variant={c.active ? "default" : "ghost"}>
  //         <Link href={c.href} aria-current={c.active ? "page" : undefined}>{c.label}</Link>
  //       </Button>
  //     ))}
  //   </nav>
  // Empty state: kind === NEIGHBOR ? t("emptyNeighbors") : existing texts.
  // List: <PostCard post={post} clamp className="<existing hover classes>" /> inside the existing Link/Interactive.
}
```

Imports: `PostKind` from `@/lib/generated/prisma`; `listPosts`, `canPostAnnouncement` from `@/domain/posts`; `Button` from `@/components/ui/button`; drop `prisma` and `canWritePosts`.

- [ ] **Step 3: `app/posts/[slug]/page.tsx`.** Use `getPostBySlug(user, slug)` (catch `NotFoundError` → `notFound()`); show `EditPostForm` when `canEditPost(user, post)` and `DeletePostButton` when `canDeletePost(user, post)`; pass `post` (now with `kind`, `pinnedUntil`) to `EditPostForm`; render `<PostCard post={post} />`. `generateMetadata` uses `getPostBySlug` as well (catch and return the not-found title) so foreign titles never leak.

- [ ] **Step 4: Bell link.** In `NotificationBell.tsx` `openItem`, replace the hard-coded routing with:

```ts
const href = (item: Item) =>
  item.type === "POST_ANNOUNCEMENT"
    ? `/posts/${item.payload.slug}`
    : item.type.startsWith("REPORT_")
      ? "/reports?view=mine"
      : "/packages";
// ...
router.push(href(item));
```

- [ ] **Step 5: Checks.** `npx tsc --noEmit` clean; `npx eslint app/posts components` clean; `npx vitest run domain/posts` passes.

- [ ] **Step 6: Commit.**

```bash
git add app/posts components/notifications/NotificationBell.tsx messages
git commit -m "feat: Tablica feed with pinned announcements, neighbor posts and kind filter"
```

---

### Task 6: Verification

- [ ] **Step 1:** `npx vitest run` (local DB only) — all pass.
- [ ] **Step 2:** `npx tsc --noEmit && npx eslint .` — no new errors.
- [ ] **Step 3 (controller, browser, local dev DB not GCP unless the user applied the migration there):**
  - As `manager`: create an announcement pinned to tomorrow → on top with the pin badge and tinted border; others got a bell notification that opens the post.
  - As `resident1`: can create a neighbor post, cannot see the kind choice; can edit/delete own post; cannot edit the announcement; chips filter; another community's slug → 404.
  - Reports page still renders on FeedCard with status actions for staff.
- [ ] **Step 4:** Report; remind the user that Cloud SQL needs `npm run db:migrate:gcp` before deploying this.
