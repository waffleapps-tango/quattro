# Reactions and Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Facebook-style reactions (5 emojis) and comments (one reply level) on announcements, neighbor posts and reports, with comment notifications (per user email/SMS settings) and aggregated in-app reaction notifications.

**Architecture:** Two new tables (`Reaction`, `Comment`) point at either a post or a report (nullable FKs + DB CHECK, cascade). A `domain/engagement` module owns visibility (reusing post/report rules), reactions, comments, a page-level summary loader and notifications. A pure `lib/engagement.ts` holds client-safe reaction math. A client `Engagement` component sits in the `FeedCard` footer slot from piece 1.

**Tech Stack:** Next.js 15, Prisma 6 + Postgres, next-intl (ICU plural/select), zod, vitest, Radix DropdownMenu, sonner.

Spec: `docs/superpowers/specs/2026-11-12-reactions-comments-design.md`. **Requires piece 1** (`docs/superpowers/plans/2026-11-12-tablica-content-model.md`) to be complete: `Post` has `communityId/authorId/kind`, `FeedCard` has a `footer` slot, `PostCard` and `ReportCard` render on `FeedCard`.

## Global Constraints

- Reaction kinds exactly `LIKE 👍, LOVE ❤️, HAHA 😂, WOW 😮, SAD 😢`. One reaction per user per target. Same kind again removes it; another kind switches.
- A target is `{ type: "post" | "report"; id: string }`. Exactly one of `postId` / `reportId` is set on every `Reaction` and `Comment` (DB CHECK).
- Visibility: posts → member of the post's community; PUBLIC reports → member of the report's community; PRIVATE reports → the report author or `STAFF_ROLES` (`RECEPTIONIST`, `MANAGER`, `ADMIN`, from `@/domain/packages/roles`). Not visible → `NotFoundError`.
- PRIVATE reports take no reactions (`ValidationError`).
- Comment body trimmed, 1..2000 characters. Replies only to a non-deleted top-level comment on the same target.
- Edit: comment author only. Delete (soft): author, or staff of the target (posts: `MANAGER`/`ADMIN`; reports: `STAFF_ROLES`). Staff deleting someone else's comment writes audit `COMMENT_DELETED`.
- Notifications: `COMMENT_ADDED` to the target author and (for replies) the parent comment author, never the commenter, dedupeKey `COMMENT_ADDED:<commentId>:<recipientId>`, email/SMS per user preferences. `REACTIONS_ADDED` in-app only, one row per recipient+target (dedupeKey `REACTIONS:<type>:<id>`) updated in place (count, `readAt = null`, `createdAt = now`); only a *new* reaction by someone other than the target author notifies; switching or removing does not.
- Names through `maskPerson`; non-staff viewers never receive another user's email.
- All strings in pl and en.
- **Tests wipe the database.** Run vitest and `prisma migrate dev` only against local Docker Postgres (`.env` → `localhost:5432`). Never `.env.gcp`, never `*:gcp`. Cloud SQL migration is a manual step for the user.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/<ts>_reactions_comments/migration.sql` | Tables, CHECKs |
| `domain/__test-helpers__/fixtures.ts` | cleanup order |
| `lib/engagement.ts` + `lib/engagement.test.ts` | Pure: kinds, emoji, `applyReaction`, `topReactions` |
| `domain/notifications/types.ts`, `domain/notifications/index.ts` (+ test) | New types, in-app-only set |
| `domain/engagement/targets.ts` | `Target`, `resolveTarget`, `targetWhere`, `targetKey` |
| `domain/engagement/reactions.ts` (+ `reactions.test.ts`) | `setReaction`, reaction notification |
| `domain/engagement/comments.ts` (+ `comments.test.ts`) | add/edit/delete/list, comment notifications |
| `domain/engagement/summary.ts` (+ `summary.test.ts`) | `engagementSummary` |
| `domain/engagement/index.ts` | Re-exports |
| `actions/engagement.ts` | Server actions |
| `components/feed/Engagement.tsx`, `components/feed/Comments.tsx` | Client UI |
| `components/posts/PostCard.tsx`, `components/reports/ReportCard.tsx`, `components/reports/ReportsList.tsx`, `app/posts/page.tsx`, `app/posts/[slug]/page.tsx`, `app/reports/page.tsx`, `components/notifications/NotificationBell.tsx` | Wiring |
| `messages/pl.json`, `messages/en.json` | Strings |

---

### Task 1: Schema, migration, pure reaction helpers

**Files:** `prisma/schema.prisma`, new migration, `domain/__test-helpers__/fixtures.ts`, create `lib/engagement.ts`, `lib/engagement.test.ts`

**Interfaces:**
- Produces: Prisma models `Reaction`, `Comment`, enum `ReactionKind`; compound unique inputs `userId_postId`, `userId_reportId`.
- Produces from `lib/engagement.ts`: `REACTION_KINDS`, `type ReactionKindName`, `REACTION_EMOJI`, `type ReactionSummary = { counts: Partial<Record<ReactionKindName, number>>; total: number; mine: ReactionKindName | null }`, `applyReaction(s, kind): ReactionSummary`, `topReactions(s, n = 3): ReactionKindName[]`.

- [ ] **Step 1: Verify local DB** (`grep '^DATABASE_URL' .env`, `docker ps | grep quattro-postgres-1`).

- [ ] **Step 2: Schema.** Add to `prisma/schema.prisma`:

```prisma
enum ReactionKind {
  LIKE
  LOVE
  HAHA
  WOW
  SAD
}

model Reaction {
  id        String       @id @default(cuid())
  userId    String
  postId    String?
  reportId  String?
  kind      ReactionKind
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  post   Post?   @relation(fields: [postId], references: [id], onDelete: Cascade)
  report Report? @relation(fields: [reportId], references: [id], onDelete: Cascade)

  @@unique([userId, postId])
  @@unique([userId, reportId])
  @@index([postId])
  @@index([reportId])
}

model Comment {
  id        String    @id @default(cuid())
  authorId  String
  postId    String?
  reportId  String?
  parentId  String?
  body      String
  createdAt DateTime  @default(now())
  editedAt  DateTime?
  deletedAt DateTime?

  author  User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  post    Post?     @relation(fields: [postId], references: [id], onDelete: Cascade)
  report  Report?   @relation(fields: [reportId], references: [id], onDelete: Cascade)
  parent  Comment?  @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies Comment[] @relation("CommentReplies")

  @@index([postId, createdAt])
  @@index([reportId, createdAt])
  @@index([parentId])
}
```

Back-relations: `User`: `reactions Reaction[]` and `comments Comment[]`; `Post`: `reactions Reaction[]`, `comments Comment[]`; `Report`: `reactions Reaction[]`, `comments Comment[]`.

- [ ] **Step 3: Migration.** `npx prisma migrate dev --create-only --name reactions_comments`, then append to the generated `migration.sql`:

```sql
-- Exactly one target per row (Prisma cannot express this).
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_one_target" CHECK (num_nonnulls("postId", "reportId") = 1);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_one_target" CHECK (num_nonnulls("postId", "reportId") = 1);
```

Apply: `npx prisma migrate dev`. Verify the constraint: `npx prisma db execute --stdin <<< "SELECT conname FROM pg_constraint WHERE conname LIKE '%_one_target';"` (or psql) lists both.

- [ ] **Step 4: Cleanup order.** In `cleanupDatabase` add `await prisma.reaction.deleteMany(); await prisma.comment.deleteMany();` as the first two lines (they reference users, posts, reports).

- [ ] **Step 5: Failing test** `lib/engagement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyReaction, topReactions, type ReactionSummary } from "@/lib/engagement";

const empty: ReactionSummary = { counts: {}, total: 0, mine: null };

describe("applyReaction", () => {
  it("adds, switches and removes the viewer's reaction", () => {
    const liked = applyReaction(empty, "LIKE");
    expect(liked).toEqual({ counts: { LIKE: 1 }, total: 1, mine: "LIKE" });
    const loved = applyReaction({ counts: { LIKE: 3 }, total: 3, mine: "LIKE" }, "LOVE");
    expect(loved).toEqual({ counts: { LIKE: 2, LOVE: 1 }, total: 3, mine: "LOVE" });
    expect(applyReaction(liked, "LIKE")).toEqual(empty);
  });
});

describe("topReactions", () => {
  it("returns the most used kinds first, at most n", () => {
    const s: ReactionSummary = { counts: { SAD: 1, LIKE: 5, LOVE: 3, WOW: 2 }, total: 11, mine: null };
    expect(topReactions(s)).toEqual(["LIKE", "LOVE", "WOW"]);
    expect(topReactions(empty)).toEqual([]);
  });
});
```

Run `npx vitest run lib/engagement.test.ts` → FAIL.

- [ ] **Step 6: Implement `lib/engagement.ts`:**

```ts
// Client-safe reaction helpers (no Prisma imports here).
export const REACTION_KINDS = ["LIKE", "LOVE", "HAHA", "WOW", "SAD"] as const;
export type ReactionKindName = (typeof REACTION_KINDS)[number];

export const REACTION_EMOJI: Record<ReactionKindName, string> = {
  LIKE: "👍",
  LOVE: "❤️",
  HAHA: "😂",
  WOW: "😮",
  SAD: "😢",
};

export type ReactionSummary = {
  counts: Partial<Record<ReactionKindName, number>>;
  total: number;
  mine: ReactionKindName | null;
};

// The summary after the viewer picks `kind`: same kind again removes it, another switches.
export function applyReaction(s: ReactionSummary, kind: ReactionKindName): ReactionSummary {
  const counts = { ...s.counts };
  const dec = (k: ReactionKindName) => {
    const n = (counts[k] ?? 0) - 1;
    if (n > 0) counts[k] = n;
    else delete counts[k];
  };
  if (s.mine) dec(s.mine);
  if (s.mine === kind) return { counts, total: s.total - 1, mine: null };
  counts[kind] = (counts[kind] ?? 0) + 1;
  return { counts, total: s.total - (s.mine ? 1 : 0) + 1, mine: kind };
}

export function topReactions(s: ReactionSummary, n = 3): ReactionKindName[] {
  return REACTION_KINDS.filter((k) => (s.counts[k] ?? 0) > 0)
    .sort((a, b) => (s.counts[b] ?? 0) - (s.counts[a] ?? 0))
    .slice(0, n);
}
```

Run → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit** `git add prisma domain/__test-helpers__/fixtures.ts lib/engagement.ts lib/engagement.test.ts && git commit -m "feat: reaction and comment tables, client-safe reaction helpers"`

---

### Task 2: Notification types and in-app-only delivery

**Files:** `domain/notifications/types.ts`, `domain/notifications/index.ts`, `domain/notifications/notify.test.ts`, messages

**Interfaces:**
- Produces: types `COMMENT_ADDED` payload `{ targetType: "post" | "report"; targetId: string; title: string; slug: string; kind: "comment" | "reply" }`, `REACTIONS_ADDED` payload `{ targetType; targetId; title; slug; count: number }` (`slug` is `""` for reports); `IN_APP_ONLY: ReadonlySet<NotificationType>` containing `REACTIONS_ADDED`.

- [ ] **Step 1: Failing test.** Append to `domain/notifications/notify.test.ts` (reuse its existing setup helpers/fixtures for a community and a user; read the file first):

```ts
it("sends in-app-only types to the inbox only, even when email and sms are on", async () => {
  // given a user with emailEnabled and smsEnabled+phone (create the NotificationPreference row like the
  // existing tests do), when notify() is called with REACTIONS_ADDED:
  await prisma.$transaction((tx) =>
    notify(tx, {
      communityId: community.id,
      type: "REACTIONS_ADDED",
      recipientUserIds: [user.id],
      payload: { targetType: "post", targetId: "p1", title: "T", slug: "t", count: 2 },
      dedupeKey: "REACTIONS:post:p1",
    }),
  );
  const deliveries = await prisma.notificationDelivery.findMany();
  expect(deliveries.map((d) => d.channel)).toEqual(["in-app"]); // inAppChannel.id
});
```

Run `npx vitest run domain/notifications/notify.test.ts` → FAIL (unknown type).

- [ ] **Step 2: Types.** In `domain/notifications/types.ts`:

```ts
const targetPayload = z.object({
  targetType: z.enum(["post", "report"]),
  targetId: z.string(),
  title: z.string(),
  slug: z.string(),
});
```

entries `COMMENT_ADDED: targetPayload.extend({ kind: z.enum(["comment", "reply"]) }),` and `REACTIONS_ADDED: targetPayload.extend({ count: z.number().int().min(1) }),`, and after the type export:

```ts
// Types that only ever go to the in-app inbox (never email/SMS), whatever the user's preferences.
export const IN_APP_ONLY: ReadonlySet<NotificationType> = new Set<NotificationType>(["REACTIONS_ADDED"]);
```

- [ ] **Step 3: notify honours it.** In `domain/notifications/index.ts` import `IN_APP_ONLY` and `inAppChannel` (from `./channels/in-app`) and replace the `channelsByUser` line:

```ts
  const channelsByUser = IN_APP_ONLY.has(params.type)
    ? new Map(recipientIds.map((id) => [id, [inAppChannel.id]]))
    : await resolveChannelsByUser(tx, recipientIds);
```

- [ ] **Step 4: Texts** (python json update as in earlier plans, `notifications.types`):

pl:
```json
"COMMENT_ADDED": { "title": "{kind, select, reply {Nowa odpowiedź na Twój komentarz} other {Nowy komentarz}}", "body": "„{title}”" },
"REACTIONS_ADDED": { "title": "Nowe reakcje", "body": "{count, plural, one {# osoba zareagowała} few {# osoby zareagowały} many {# osób zareagowało} other {# osoby zareagowały}} na „{title}”" }
```
en:
```json
"COMMENT_ADDED": { "title": "{kind, select, reply {New reply to your comment} other {New comment}}", "body": "“{title}”" },
"REACTIONS_ADDED": { "title": "New reactions", "body": "{count, plural, one {# person reacted} other {# people reacted}} to “{title}”" }
```

- [ ] **Step 5:** `npx vitest run domain/notifications` → PASS (new and existing). Commit `git add domain/notifications messages && git commit -m "feat: comment and reaction notification types, in-app-only delivery"`

---

### Task 3: Targets and reactions domain

**Files:** create `domain/engagement/targets.ts`, `domain/engagement/reactions.ts`, `domain/engagement/index.ts`, `domain/engagement/reactions.test.ts`

**Interfaces:**
- Produces:
  - `type Target = { type: "post" | "report"; id: string }`
  - `targetKey(t: Target): string` → `"post:<id>"` / `"report:<id>"`
  - `targetWhere(t: Target): { postId: string } | { reportId: string }`
  - `resolveTarget(actor, t): Promise<ResolvedTarget>` with `ResolvedTarget = { communityId: string; authorId: string | null; title: string; slug: string; isPrivate: boolean; viewerIsStaff: boolean }` (throws `NotFoundError`)
  - `setReaction(actor, t, kind: ReactionKindName | null): Promise<ReactionSummary>`

- [ ] **Step 1: Failing tests** `domain/engagement/reactions.test.ts`:

```ts
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
  const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
  const author = await createUserWithMembership({ communityId: community.id, buildingId: building.id, apartmentId: apartment.id, role: Role.RESIDENT });
  const neighbor = await createUserWithMembership({ communityId: community.id, buildingId: building.id, role: Role.RESIDENT });
  const receptionist = await createUserWithMembership({ communityId: community.id, role: Role.RECEPTIONIST });
  const post = await createPost(author, community.id, { kind: PostKind.NEIGHBOR, title: "Pożyczę cukier", content: "Ktoś?" });
  return { community, building, apartment, author, neighbor, receptionist, post };
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
    expect(await setReaction(s.neighbor, postT(s.post.id), "LIKE")).toEqual({ counts: { LIKE: 1 }, total: 1, mine: "LIKE" });
    expect(await setReaction(s.neighbor, postT(s.post.id), "LOVE")).toEqual({ counts: { LOVE: 1 }, total: 1, mine: "LOVE" });
    await setReaction(s.author, postT(s.post.id), "LIKE");
    expect(await prisma.reaction.count()).toBe(2);
    expect(await setReaction(s.neighbor, postT(s.post.id), "LOVE")).toEqual({ counts: { LIKE: 1 }, total: 1, mine: null });
    expect(await setReaction(s.author, postT(s.post.id), null)).toEqual({ counts: {}, total: 0, mine: null });
  });

  it("notifies the author once per target, updating the count, never for own reactions", async () => {
    const s = await setup();
    await setReaction(s.author, postT(s.post.id), "LIKE"); // own: no notification
    expect(await prisma.notification.count()).toBe(0);
    await setReaction(s.neighbor, postT(s.post.id), "LIKE");
    await setReaction(s.receptionist, postT(s.post.id), "WOW");
    await setReaction(s.neighbor, postT(s.post.id), "LOVE"); // switch: no new notification
    const rows = await prisma.notification.findMany({ where: { type: "REACTIONS_ADDED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(s.author.id);
    expect(rows[0].payload).toMatchObject({ targetType: "post", targetId: s.post.id, count: 2 });
    const deliveries = await prisma.notificationDelivery.findMany({ where: { notificationId: rows[0].id } });
    expect(deliveries.every((d) => d.channel === "in-app")).toBe(true);
  });

  it("marks the aggregated notification unread again on a new reaction", async () => {
    const s = await setup();
    await setReaction(s.neighbor, postT(s.post.id), "LIKE");
    await prisma.notification.updateMany({ data: { readAt: new Date() } });
    await setReaction(s.receptionist, postT(s.post.id), "LIKE");
    const [row] = await prisma.notification.findMany({ where: { type: "REACTIONS_ADDED" } });
    expect(row.readAt).toBeNull();
    expect(row.payload).toMatchObject({ count: 2 });
  });

  it("rejects reactions on private reports and hides other communities' targets", async () => {
    const s = await setup();
    const report = await privateReport(s);
    await expect(setReaction(s.author, { type: "report", id: report.id }, "LIKE")).rejects.toThrow(ValidationError);
    await expect(setReaction(s.neighbor, { type: "report", id: report.id }, "LIKE")).rejects.toThrow(NotFoundError);

    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.RESIDENT });
    await expect(setReaction(outsider, postT(s.post.id), "LIKE")).rejects.toThrow(NotFoundError);
  });
});
```

`"in-app"` is `inAppChannel.id` (`domain/notifications/channels/in-app.ts`).

Run `npx vitest run domain/engagement` → FAIL.

- [ ] **Step 2: `domain/engagement/targets.ts`:**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { NotFoundError } from "@/domain/errors";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { Role } from "@/lib/generated/prisma";

export type Target = { type: "post" | "report"; id: string };
export type ResolvedTarget = {
  communityId: string;
  authorId: string | null;
  title: string;
  slug: string; // "" for reports
  isPrivate: boolean;
  viewerIsStaff: boolean;
};

const POST_STAFF: Role[] = [Role.MANAGER, Role.ADMIN];

export const targetKey = (t: Target) => `${t.type}:${t.id}`;
export const targetWhere = (t: Target) => (t.type === "post" ? { postId: t.id } : { reportId: t.id });

// Same visibility as the post/report pages; anything not visible is "not found" (no existence leak).
export async function resolveTarget(actor: SessionUser, t: Target): Promise<ResolvedTarget> {
  if (t.type === "post") {
    const post = await prisma.post.findUnique({
      where: { id: t.id },
      select: { communityId: true, authorId: true, title: true, slug: true },
    });
    const m = post && actor.memberships.find((x) => x.communityId === post.communityId);
    if (!post || !m) throw new NotFoundError(`Post ${t.id} not found`);
    return { ...post, isPrivate: false, viewerIsStaff: POST_STAFF.includes(m.role) };
  }
  const report = await prisma.report.findUnique({
    where: { id: t.id },
    select: { communityId: true, authorId: true, title: true, visibility: true },
  });
  const m = report && actor.memberships.find((x) => x.communityId === report.communityId);
  if (!report || !m) throw new NotFoundError(`Report ${t.id} not found`);
  const viewerIsStaff = STAFF_ROLES.includes(m.role);
  const isPrivate = report.visibility === "PRIVATE";
  if (isPrivate && report.authorId !== actor.id && !viewerIsStaff) throw new NotFoundError(`Report ${t.id} not found`);
  return { communityId: report.communityId, authorId: report.authorId, title: report.title, slug: "", isPrivate, viewerIsStaff };
}
```

- [ ] **Step 3: `domain/engagement/reactions.ts`:**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { ValidationError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { NOTIFICATION_TYPES } from "@/domain/notifications/types";
import type { Prisma } from "@/lib/generated/prisma";
import type { ReactionKindName, ReactionSummary } from "@/lib/engagement";
import { resolveTarget, targetWhere, type ResolvedTarget, type Target } from "./targets";

export async function reactionSummary(actor: SessionUser, t: Target): Promise<ReactionSummary> {
  const rows = await prisma.reaction.findMany({ where: targetWhere(t), select: { userId: true, kind: true } });
  const counts: ReactionSummary["counts"] = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return { counts, total: rows.length, mine: rows.find((r) => r.userId === actor.id)?.kind ?? null };
}

async function notifyReactions(tx: Prisma.TransactionClient, target: ResolvedTarget, t: Target) {
  if (!target.authorId) return;
  const count = await tx.reaction.count({ where: { ...targetWhere(t), userId: { not: target.authorId } } });
  const payload = NOTIFICATION_TYPES.REACTIONS_ADDED.parse({
    targetType: t.type,
    targetId: t.id,
    title: target.title,
    slug: target.slug,
    count,
  });
  const dedupeKey = `REACTIONS:${t.type}:${t.id}`;
  const existing = await tx.notification.findUnique({
    where: { recipientUserId_dedupeKey: { recipientUserId: target.authorId, dedupeKey } },
  });
  if (existing) {
    await tx.notification.update({
      where: { id: existing.id },
      data: { payload, readAt: null, createdAt: new Date() },
    });
  } else {
    await notify(tx, {
      communityId: target.communityId,
      type: "REACTIONS_ADDED",
      recipientUserIds: [target.authorId],
      payload,
      dedupeKey,
    });
  }
}

// kind === the current reaction (or null) removes it; another kind switches; none yet creates.
export async function setReaction(
  actor: SessionUser,
  t: Target,
  kind: ReactionKindName | null,
): Promise<ReactionSummary> {
  const target = await resolveTarget(actor, t);
  if (target.isPrivate) throw new ValidationError("Private reports take no reactions");
  const where =
    t.type === "post"
      ? { userId_postId: { userId: actor.id, postId: t.id } }
      : { userId_reportId: { userId: actor.id, reportId: t.id } };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.reaction.findUnique({ where });
    if (kind === null || existing?.kind === kind) {
      if (existing) await tx.reaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.reaction.update({ where: { id: existing.id }, data: { kind } });
    } else {
      await tx.reaction.create({ data: { userId: actor.id, kind, ...targetWhere(t) } });
      if (target.authorId !== actor.id) await notifyReactions(tx, target, t);
    }
  });
  return reactionSummary(actor, t);
}
```

`domain/engagement/index.ts`: `export * from "./targets"; export * from "./reactions";` (later tasks add more).

- [ ] **Step 4:** `npx vitest run domain/engagement` → PASS. Commit `git add domain/engagement && git commit -m "feat: reactions on posts and public reports with aggregated notifications"`

---

### Task 4: Comments domain

**Files:** create `domain/engagement/comments.ts`, `domain/engagement/comments.test.ts`; modify `domain/engagement/index.ts`, `domain/audit/log.ts`

**Interfaces:**
- Produces:
  - `type CommentView = { id: string; parentId: string | null; body: string; deleted: boolean; createdAt: Date; editedAt: Date | null; author: { id: string; name: string | null }; canEdit: boolean; canDelete: boolean; replies: CommentView[] }`
  - `addComment(actor, t, input: { body: string; parentId?: string }): Promise<CommentView[]>` (returns the fresh thread)
  - `editComment(actor, t, commentId, body): Promise<CommentView[]>`
  - `deleteComment(actor, t, commentId): Promise<CommentView[]>`
  - `listComments(actor, t): Promise<CommentView[]>`
  - `commentAuthorSelect` and `toCommentView(row, actor, viewerIsStaff)` exported for the summary task.
  - Audit action `COMMENT_DELETED`.

- [ ] **Step 1: Failing tests** `domain/engagement/comments.test.ts` (copy the imports, `setup`, `postT` and `privateReport` helpers from `reactions.test.ts`; add `addComment, editComment, deleteComment, listComments` and `UnauthorizedError` imports):

```ts
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
    await prisma.user.update({ where: { id: s.neighbor.id }, data: { shareName: false } });
    await addComment(s.neighbor, postT(s.post.id), { body: "anonimowo" });
    const [c] = await listComments(s.author, postT(s.post.id));
    expect(c.author.name).not.toContain("@");
  });
});
```

Run → FAIL.

- [ ] **Step 2: Audit action.** Add `| "COMMENT_DELETED"` to `AuditAction`.

- [ ] **Step 3: Implement `domain/engagement/comments.ts`:**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { maskPerson } from "@/domain/privacy/person";
import type { Prisma } from "@/lib/generated/prisma";
import { resolveTarget, targetWhere, type Target } from "./targets";

export const MAX_COMMENT_LENGTH = 2000;

export const commentAuthorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  shareName: true,
} satisfies Prisma.UserSelect;

export type CommentView = {
  id: string;
  parentId: string | null;
  body: string;
  deleted: boolean;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string | null };
  canEdit: boolean;
  canDelete: boolean;
  replies: CommentView[];
};

type CommentRow = Prisma.CommentGetPayload<{ include: { author: { select: typeof commentAuthorSelect } } }>;

export function toCommentView(c: CommentRow, actor: SessionUser, viewerIsStaff: boolean): CommentView {
  const p = maskPerson(c.author, actor.id);
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  const own = c.authorId === actor.id;
  const deleted = c.deletedAt !== null;
  return {
    id: c.id,
    parentId: c.parentId,
    body: deleted ? "" : c.body,
    deleted,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    author: { id: c.authorId, name: full || (viewerIsStaff || own ? p.email || null : null) },
    canEdit: own && !deleted,
    canDelete: !deleted && (own || viewerIsStaff),
    replies: [],
  };
}

function cleanBody(body: string) {
  const text = body.trim();
  if (!text || text.length > MAX_COMMENT_LENGTH) throw new ValidationError("comment must be 1..2000 characters");
  return text;
}

const sameTarget = (c: { postId: string | null; reportId: string | null }, t: Target) =>
  t.type === "post" ? c.postId === t.id : c.reportId === t.id;

export async function listComments(actor: SessionUser, t: Target): Promise<CommentView[]> {
  const target = await resolveTarget(actor, t);
  return loadThread(actor, t, target.viewerIsStaff);
}

async function loadThread(actor: SessionUser, t: Target, viewerIsStaff: boolean): Promise<CommentView[]> {
  const rows = await prisma.comment.findMany({
    where: targetWhere(t),
    include: { author: { select: commentAuthorSelect } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const tops = new Map<string, CommentView>();
  for (const r of rows) if (!r.parentId) tops.set(r.id, toCommentView(r, actor, viewerIsStaff));
  for (const r of rows) {
    if (r.parentId && !r.deletedAt) tops.get(r.parentId)?.replies.push(toCommentView(r, actor, viewerIsStaff));
  }
  return [...tops.values()].filter((c) => !c.deleted || c.replies.length > 0);
}

export async function addComment(
  actor: SessionUser,
  t: Target,
  input: { body: string; parentId?: string },
): Promise<CommentView[]> {
  const target = await resolveTarget(actor, t);
  const body = cleanBody(input.body);
  let parent: { authorId: string } | null = null;
  if (input.parentId) {
    const p = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!p || p.deletedAt || p.parentId || !sameTarget(p, t)) throw new ValidationError("invalid parent comment");
    parent = p;
  }

  await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { authorId: actor.id, body, parentId: input.parentId ?? null, ...targetWhere(t) },
    });
    const recipients = new Map<string, "comment" | "reply">();
    if (target.authorId) recipients.set(target.authorId, "comment");
    if (parent && !recipients.has(parent.authorId)) recipients.set(parent.authorId, "reply");
    recipients.delete(actor.id);
    for (const [recipientId, kind] of recipients) {
      await notify(tx, {
        communityId: target.communityId,
        type: "COMMENT_ADDED",
        recipientUserIds: [recipientId],
        payload: { targetType: t.type, targetId: t.id, title: target.title, slug: target.slug, kind },
        dedupeKey: `COMMENT_ADDED:${comment.id}:${recipientId}`,
      });
    }
  });
  return loadThread(actor, t, target.viewerIsStaff);
}

async function loadComment(t: Target, commentId: string) {
  const c = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!c || !sameTarget(c, t)) throw new NotFoundError(`Comment ${commentId} not found`);
  return c;
}

export async function editComment(actor: SessionUser, t: Target, commentId: string, body: string) {
  const target = await resolveTarget(actor, t);
  const c = await loadComment(t, commentId);
  if (c.authorId !== actor.id) throw new UnauthorizedError(`User ${actor.id} cannot edit comment ${commentId}`);
  if (c.deletedAt) throw new ValidationError("comment was deleted");
  await prisma.comment.update({ where: { id: c.id }, data: { body: cleanBody(body), editedAt: new Date() } });
  return loadThread(actor, t, target.viewerIsStaff);
}

export async function deleteComment(actor: SessionUser, t: Target, commentId: string) {
  const target = await resolveTarget(actor, t);
  const c = await loadComment(t, commentId);
  const own = c.authorId === actor.id;
  if (!own && !target.viewerIsStaff) throw new UnauthorizedError(`User ${actor.id} cannot delete comment ${commentId}`);
  if (!c.deletedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.comment.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
      if (!own) {
        await writeAuditLog(tx, {
          communityId: target.communityId,
          userId: actor.id,
          action: "COMMENT_DELETED",
          entity: "Comment",
          entityId: c.id,
          metadata: { authorId: c.authorId, target: `${t.type}:${t.id}` },
        });
      }
    });
  }
  return loadThread(actor, t, target.viewerIsStaff);
}
```

Add `export * from "./comments";` to `domain/engagement/index.ts`.

- [ ] **Step 4:** `npx vitest run domain/engagement` → PASS. Commit `git add domain/engagement domain/audit/log.ts && git commit -m "feat: comments with one reply level, moderation and notifications"`

---

### Task 5: Page summary loader and server actions

**Files:** create `domain/engagement/summary.ts`, `domain/engagement/summary.test.ts`, `actions/engagement.ts`; modify `domain/engagement/index.ts`

**Interfaces:**
- Produces:
  - `type EngagementSummary = ReactionSummary & { commentCount: number; preview: CommentView[] }` (preview = last 2 non-deleted comments, oldest of the two first, `canEdit`/`canDelete` false, no replies nesting)
  - `EMPTY_ENGAGEMENT: EngagementSummary`
  - `engagementSummary(actor, targets: Target[]): Promise<Record<string, EngagementSummary>>` keyed by `targetKey`. Callers pass only targets they already listed for this actor (pages); it does no per-target access check.
  - Server actions (all return `{ ok: true; data } | { ok: false; message }`): `setReactionAction(target, kind | null)` → `ReactionSummary`; `listCommentsAction(target)`, `addCommentAction(target, body, parentId?)`, `editCommentAction(target, commentId, body)`, `deleteCommentAction(target, commentId)` → `CommentView[]`.

- [ ] **Step 1: Failing test** `domain/engagement/summary.test.ts` (same setup helper):

```ts
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
});
```

- [ ] **Step 2: `domain/engagement/summary.ts`:**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import type { ReactionSummary } from "@/lib/engagement";
import { commentAuthorSelect, toCommentView, type CommentView } from "./comments";
import { targetKey, type Target } from "./targets";

export type EngagementSummary = ReactionSummary & { commentCount: number; preview: CommentView[] };
export const EMPTY_ENGAGEMENT: EngagementSummary = { counts: {}, total: 0, mine: null, commentCount: 0, preview: [] };

// One page of cards → two queries. Callers pass targets they already listed for this actor.
// ponytail: loads every reaction row and live comment of the page; switch to groupBy + a window
// query if a single page ever carries thousands of them.
export async function engagementSummary(
  actor: SessionUser,
  targets: Target[],
): Promise<Record<string, EngagementSummary>> {
  if (targets.length === 0) return {};
  const postIds = targets.filter((t) => t.type === "post").map((t) => t.id);
  const reportIds = targets.filter((t) => t.type === "report").map((t) => t.id);
  const or = [
    ...(postIds.length ? [{ postId: { in: postIds } }] : []),
    ...(reportIds.length ? [{ reportId: { in: reportIds } }] : []),
  ];
  const [reactions, comments] = await Promise.all([
    prisma.reaction.findMany({ where: { OR: or }, select: { userId: true, postId: true, reportId: true, kind: true } }),
    prisma.comment.findMany({
      where: { OR: or, deletedAt: null },
      include: { author: { select: commentAuthorSelect } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const isStaff = actor.memberships.some((m) => m.role !== "RESIDENT");
  const keyOf = (r: { postId: string | null; reportId: string | null }) =>
    r.postId ? `post:${r.postId}` : `report:${r.reportId}`;

  const out: Record<string, EngagementSummary> = {};
  for (const t of targets) out[targetKey(t)] = { counts: {}, total: 0, mine: null, commentCount: 0, preview: [] };
  for (const r of reactions) {
    const s = out[keyOf(r)];
    s.counts[r.kind] = (s.counts[r.kind] ?? 0) + 1;
    s.total++;
    if (r.userId === actor.id) s.mine = r.kind;
  }
  for (const c of comments) {
    const s = out[keyOf(c)];
    s.commentCount++;
    s.preview.push({ ...toCommentView(c, actor, isStaff), canEdit: false, canDelete: false });
    if (s.preview.length > 2) s.preview.shift();
  }
  return out;
}
```

(`isStaff` here only decides whether an email may be shown as a fallback name in the preview; it errs on staff = any non-resident role, which matches who may see emails elsewhere.)

Add `export * from "./summary";` to the index. Run tests → PASS.

- [ ] **Step 3: `actions/engagement.ts`:**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, type SessionUser } from "@/auth/session";
import * as engagement from "@/domain/engagement";
import { dispatchPending } from "@/domain/notifications/dispatch";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { REACTION_KINDS, type ReactionKindName, type ReactionSummary } from "@/lib/engagement";

const targetSchema = z.object({ type: z.enum(["post", "report"]), id: z.string().min(1).max(64) });
type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function run<T>(rawTarget: unknown, fn: (actor: SessionUser, t: engagement.Target) => Promise<T>): Promise<Result<T>> {
  const t = await getTranslations("engagement.errors");
  const actor = await getCurrentUser();
  const target = targetSchema.safeParse(rawTarget);
  if (!actor || !target.success) return { ok: false, message: t("notFound") };
  try {
    const data = await fn(actor, target.data);
    revalidatePath(target.data.type === "post" ? "/posts" : "/reports");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, message: t("notFound") };
    if (error instanceof UnauthorizedError) return { ok: false, message: t("forbidden") };
    if (error instanceof ValidationError) return { ok: false, message: t("invalid") };
    console.error(error);
    return { ok: false, message: t("generic") };
  }
}

export async function setReactionAction(target: unknown, kind: ReactionKindName | null): Promise<Result<ReactionSummary>> {
  const k = kind === null || REACTION_KINDS.includes(kind) ? kind : null;
  return run(target, (actor, t) => engagement.setReaction(actor, t, k));
}

export async function listCommentsAction(target: unknown) {
  return run(target, (actor, t) => engagement.listComments(actor, t));
}

export async function addCommentAction(target: unknown, body: string, parentId?: string) {
  const res = await run(target, (actor, t) => engagement.addComment(actor, t, { body: String(body), parentId }));
  if (res.ok) after(() => dispatchPending().catch(console.error));
  return res;
}

export async function editCommentAction(target: unknown, commentId: string, body: string) {
  return run(target, (actor, t) => engagement.editComment(actor, t, String(commentId), String(body)));
}

export async function deleteCommentAction(target: unknown, commentId: string) {
  return run(target, (actor, t) => engagement.deleteComment(actor, t, String(commentId)));
}
```

Messages `engagement.errors` (pl/en): `notFound` "Ten wpis nie jest już dostępny." / "This item is no longer available.", `forbidden` "Nie masz uprawnień do tej operacji." / "You are not allowed to do that.", `invalid` "Komentarz musi mieć od 1 do 2000 znaków." / "A comment must be 1 to 2000 characters.", `generic` "Nie udało się zapisać. Spróbuj ponownie." / "Could not save. Please try again."

- [ ] **Step 4:** `npx tsc --noEmit` clean, `npx vitest run domain/engagement lib` pass. Commit `git add domain/engagement actions/engagement.ts messages && git commit -m "feat: engagement summary loader and server actions"`

---

### Task 6: Engagement UI and wiring

**Files:** create `components/feed/Engagement.tsx`, `components/feed/Comments.tsx`; modify `components/posts/PostCard.tsx`, `components/reports/ReportCard.tsx`, `components/reports/ReportsList.tsx`, `app/posts/page.tsx`, `app/posts/[slug]/page.tsx`, `app/reports/page.tsx`, `components/notifications/NotificationBell.tsx`, messages

**Interfaces:**
- Consumes: Task 5 actions and types; `FeedCard` `footer` slot.
- Produces: `Engagement({ target, initial, canReact?, privateThread?, defaultExpanded? })`; `PostCard` gains `href?: string` (title becomes a link, the card itself is no longer wrapped in a link) and passes `footer` through.

- [ ] **Step 1: Strings** under `engagement` (pl / en):

```
react.LIKE "Lubię to" / "Like"; react.LOVE "Super" / "Love"; react.HAHA "Haha" / "Haha"; react.WOW "Wow" / "Wow"; react.SAD "Przykro mi" / "Sad"
like "Lubię" / "Like"; chooseReaction "Wybierz reakcję" / "Choose a reaction"
reactionsCount "{count, plural, one {# reakcja} few {# reakcje} many {# reakcji} other {# reakcji}}" / "{count, plural, one {# reaction} other {# reactions}}"
comment "Komentuj" / "Comment"
comments "{count, plural, =0 {Brak komentarzy} one {# komentarz} few {# komentarze} many {# komentarzy} other {# komentarza}}" / "{count, plural, =0 {No comments} one {# comment} other {# comments}}"
showAll "Pokaż wszystkie ({count})" / "Show all ({count})"; hide "Zwiń" / "Collapse"
placeholder "Napisz komentarz…" / "Write a comment…"; replyPlaceholder "Napisz odpowiedź…" / "Write a reply…"
send "Wyślij" / "Send"; reply "Odpowiedz" / "Reply"; edit "Edytuj" / "Edit"; save "Zapisz" / "Save"; cancel "Anuluj" / "Cancel"
delete "Usuń" / "Delete"; confirmDelete "Na pewno usunąć?" / "Delete for sure?"
deleted "Komentarz usunięty" / "Comment deleted"; edited "(edytowano)" / "(edited)"
neighbor "Sąsiad" / "Neighbor"; you "Ty" / "You"
privateThread "Rozmowa widoczna tylko dla Ciebie i administracji." / "Only you and the management can see this conversation."
```

- [ ] **Step 2: `components/feed/Engagement.tsx`:**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, MessageCircle, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setReactionAction } from "@/actions/engagement";
import { applyReaction, REACTION_EMOJI, REACTION_KINDS, topReactions, type ReactionKindName } from "@/lib/engagement";
import type { EngagementSummary, Target } from "@/domain/engagement";
import { Comments } from "./Comments";

const LONG_PRESS_MS = 450;

export function Engagement({
  target,
  initial,
  canReact = true,
  privateThread = false,
  defaultExpanded = false,
}: {
  target: Target;
  initial: EngagementSummary;
  canReact?: boolean;
  privateThread?: boolean;
  defaultExpanded?: boolean;
}) {
  const t = useTranslations("engagement");
  const [summary, setSummary] = useState(initial);
  const [commentCount, setCommentCount] = useState(initial.commentCount);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);

  const react = (kind: ReactionKindName) => {
    const before = summary;
    setSummary(applyReaction(summary, kind));
    setPickerOpen(false);
    startTransition(async () => {
      const res = await setReactionAction(target, kind);
      if (res.ok) setSummary((s) => ({ ...s, ...res.data }));
      else {
        setSummary(before);
        toast.error(res.message);
      }
    });
  };
  const startPress = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setPickerOpen(true);
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const mine = summary.mine;
  const top = topReactions(summary);

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        {summary.total > 0 ? (
          <span className="flex items-center gap-1" aria-label={t("reactionsCount", { count: summary.total })}>
            <span aria-hidden="true">{top.map((k) => REACTION_EMOJI[k]).join("")}</span>
            <span className="tabular-nums">{summary.total}</span>
          </span>
        ) : (
          <span />
        )}
        <button type="button" className="hover:underline" onClick={() => setExpanded((e) => !e)}>
          {t("comments", { count: commentCount })}
        </button>
      </div>

      <div className="flex items-center gap-1 border-y py-1">
        {canReact && (
          <div className="flex flex-1 items-center" onMouseLeave={endPress}>
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              aria-pressed={mine !== null}
              onPointerDown={startPress}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onClick={() => {
                if (longPressed.current) return;
                react(mine ?? "LIKE");
              }}
            >
              {mine ? (
                <span aria-hidden="true" className="mr-2">{REACTION_EMOJI[mine]}</span>
              ) : (
                <ThumbsUp className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {mine ? t(`react.${mine}`) : t("like")}
            </Button>
            <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen} modal={false}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={t("chooseReaction")}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="flex gap-1 p-1">
                {REACTION_KINDS.map((k) => (
                  <DropdownMenuItem
                    key={k}
                    onSelect={() => react(k)}
                    aria-label={t(`react.${k}`)}
                    className="text-2xl transition-transform hover:scale-125 focus:scale-125"
                  >
                    {REACTION_EMOJI[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={() => {
            setExpanded(true);
            setTimeout(() => composer.current?.focus(), 0);
          }}
        >
          <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("comment")}
        </Button>
      </div>

      {privateThread && <p className="text-xs text-muted-foreground">{t("privateThread")}</p>}
      <Comments
        target={target}
        preview={initial.preview}
        count={commentCount}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onCountChange={setCommentCount}
        composerRef={composer}
      />
    </div>
  );
}
```

- [ ] **Step 3: `components/feed/Comments.tsx`:**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
  listCommentsAction,
} from "@/actions/engagement";
import type { CommentView, Target } from "@/domain/engagement";

const visibleCount = (list: CommentView[]) =>
  list.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.length, 0);

export function Comments({
  target,
  preview,
  count,
  expanded,
  onExpand,
  onCountChange,
  composerRef,
}: {
  target: Target;
  preview: CommentView[];
  count: number;
  expanded: boolean;
  onExpand: () => void;
  onCountChange: (n: number) => void;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("engagement");
  const [thread, setThread] = useState<CommentView[] | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (res: { ok: true; data: CommentView[] } | { ok: false; message: string }) => {
    if (!res.ok) return toast.error(res.message);
    setThread(res.data);
    onCountChange(visibleCount(res.data));
  };

  useEffect(() => {
    if (expanded && thread === null) startTransition(async () => apply(await listCommentsAction(target)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const send = (body: string, parentId?: string) =>
    new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const res = await addCommentAction(target, body, parentId);
        apply(res);
        if (res.ok) onExpand();
        resolve(res.ok);
      }),
    );

  const shown = expanded ? (thread ?? preview) : preview;

  return (
    <div className="space-y-3">
      {!expanded && count > preview.length && (
        <button type="button" className="text-sm font-medium text-muted-foreground hover:underline" onClick={onExpand}>
          {t("showAll", { count })}
        </button>
      )}
      <ul className="space-y-3">
        {shown.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            busy={pending}
            onReply={(body) => send(body, c.id)}
            onEdit={(id, body) => startTransition(async () => apply(await editCommentAction(target, id, body)))}
            onDelete={(id) => startTransition(async () => apply(await deleteCommentAction(target, id)))}
            canReply={expanded}
          />
        ))}
      </ul>
      <Composer
        placeholder={t("placeholder")}
        busy={pending}
        textareaRef={composerRef}
        onSubmit={(body) => send(body)}
      />
    </div>
  );
}

function Composer({
  placeholder,
  busy,
  onSubmit,
  textareaRef,
  onCancel,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onCancel?: () => void;
}) {
  const t = useTranslations("engagement");
  const [body, setBody] = useState("");
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        if (await onSubmit(body)) setBody("");
      }}
    >
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={1}
        maxLength={2000}
        className="min-h-9 resize-none bg-muted"
      />
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
      )}
      <Button type="submit" size="sm" disabled={busy || !body.trim()}>
        {t("send")}
      </Button>
    </form>
  );
}

function CommentItem({
  comment,
  busy,
  onReply,
  onEdit,
  onDelete,
  canReply,
  isReply = false,
}: {
  comment: CommentView;
  busy: boolean;
  onReply: (body: string) => Promise<boolean>;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  canReply: boolean;
  isReply?: boolean;
}) {
  const t = useTranslations("engagement");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className={isReply ? "ml-8" : undefined}>
      <div className="rounded-xl bg-muted px-3 py-2 text-sm">
        {comment.deleted ? (
          <p className="italic text-muted-foreground">{t("deleted")}</p>
        ) : (
          <>
            <p className="font-medium">{comment.author.name ?? t("neighbor")}</p>
            {editing ? (
              <form
                className="mt-1 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onEdit(comment.id, draft);
                  setEditing(false);
                }}
              >
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={2} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={busy || !draft.trim()}>{t("save")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button>
                </div>
              </form>
            ) : (
              <p className="whitespace-pre-line">{comment.body}</p>
            )}
          </>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 px-3 text-xs text-muted-foreground">
        <time dateTime={new Date(comment.createdAt).toISOString()}>
          {format.relativeTime(new Date(comment.createdAt), now)}
        </time>
        {comment.editedAt && !comment.deleted && <span>{t("edited")}</span>}
        {canReply && !isReply && !comment.deleted && (
          <button type="button" className="font-medium hover:underline" onClick={() => setReplying((r) => !r)}>
            {t("reply")}
          </button>
        )}
        {comment.canEdit && !editing && (
          <button type="button" className="font-medium hover:underline" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
        )}
        {comment.canDelete &&
          (confirming ? (
            <button type="button" className="font-medium text-destructive hover:underline" onClick={() => onDelete(comment.id)}>
              {t("confirmDelete")}
            </button>
          ) : (
            <button type="button" className="font-medium hover:underline" onClick={() => setConfirming(true)}>
              {t("delete")}
            </button>
          ))}
      </div>
      {comment.replies.length > 0 && (
        <ul className="mt-2 space-y-2">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} busy={busy} onReply={onReply} onEdit={onEdit} onDelete={onDelete} canReply={false} isReply />
          ))}
        </ul>
      )}
      {replying && (
        <div className="ml-8 mt-2">
          <Composer
            placeholder={t("replyPlaceholder")}
            busy={busy}
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const ok = await onReply(body);
              if (ok) setReplying(false);
              return ok;
            }}
          />
        </div>
      )}
    </li>
  );
}
```

If the project's `Textarea` does not forward refs, use a plain `<textarea>` with the same classes as `components/ui/textarea.tsx`.

- [ ] **Step 4: Wire posts.**
  - `PostCard`: new optional prop `href?: string`; when set, `title={<Link href={href} className="hover:underline">{post.title}</Link>}`. `footer` passes through to `FeedCard`.
  - `app/posts/page.tsx`: remove the `Link`/`Interactive` wrapper around each card (buttons cannot live inside a link). Compute `const summaries = await engagementSummary(user, posts.map((p) => ({ type: "post" as const, id: p.id })));` and render `<PostCard post={post} clamp href={`/posts/${post.slug}`} footer={<Engagement target={{ type: "post", id: post.id }} initial={summaries[`post:${post.id}`] ?? EMPTY_ENGAGEMENT} />} />`.
  - `app/posts/[slug]/page.tsx`: same with one target and `defaultExpanded`.

- [ ] **Step 5: Wire reports.** In `app/reports/page.tsx`, after `listReports`, compute `const engagement = await engagementSummary(user, reports.map((r) => ({ type: "report" as const, id: r.id })));` and pass `engagement` to `ReportsList`; `ReportsList` passes `engagement={engagement[`report:${report.id}`] ?? EMPTY_ENGAGEMENT}` to `ReportCard`; `ReportCard` renders in its `footer` the status actions (if any) followed by `<Engagement target={{ type: "report", id: report.id }} initial={engagement} canReact={report.visibility === "PUBLIC"} privateThread={report.visibility === "PRIVATE"} />`. `EMPTY_ENGAGEMENT` and the `EngagementSummary` type are imported from `@/domain/engagement` with `import type` / plain import in server files only; in client files import the type with `import type` and pass the value from the server.

  Note: `EMPTY_ENGAGEMENT` is a value; client components must not import `@/domain/engagement` at runtime (it pulls Prisma). Use the server-provided value, or a local literal `{ counts: {}, total: 0, mine: null, commentCount: 0, preview: [] }` in client files.

- [ ] **Step 6: Bell links.** Extend the `href` helper in `NotificationBell.tsx`:

```ts
const href = (item: Item) => {
  const p = item.payload as Record<string, string>;
  if (item.type === "POST_ANNOUNCEMENT") return `/posts/${p.slug}`;
  if (item.type === "COMMENT_ADDED" || item.type === "REACTIONS_ADDED") {
    return p.targetType === "post" ? `/posts/${p.slug}` : "/reports?view=mine";
  }
  return item.type.startsWith("REPORT_") ? "/reports?view=mine" : "/packages";
};
```

- [ ] **Step 7: Checks.** `npx tsc --noEmit` clean; `npx eslint components app actions` clean; `npx vitest run` pass (local DB).

- [ ] **Step 8: Commit** `git add components app actions messages && git commit -m "feat: reactions and comments on Tablica posts and reports"`

---

### Task 7: Verification

- [ ] **Step 1:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` (local DB only).
- [ ] **Step 2 (controller, browser, local dev DB):** as `resident1` react 👍 then switch to ❤️ via the picker and long-press; comment, reply, edit, delete; as `manager` delete someone's comment (placeholder when it has replies); private report shows no reaction row and the private-thread hint; another resident cannot see private report comments; author sees one updating "N osób zareagowało" bell item; comment notification opens the right post; keyboard: Tab to the chevron, Enter opens the picker, arrows move, Escape closes.
- [ ] **Step 3:** Report; remind the user to run `npm run db:migrate:gcp` before deploying.
