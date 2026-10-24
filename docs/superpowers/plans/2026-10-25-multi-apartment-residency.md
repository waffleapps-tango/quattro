# Multi-apartment residency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person can be linked to several apartments in the same community and the whole app (packages, notifications, reports, profile, home, admin) works with all of them, with no behavior change for people who have one apartment.

**Architecture:** A new `ApartmentResidency` table links users to apartments; `Membership` stays the community-level role gate and its `apartmentId` column is deprecated (values left in place, never read or written by the app). `SessionUser` carries `residencies`, and every apartment-dependent call site reads `residentApartmentIds(user, communityId)` instead of `membership.apartmentId`. Managers add and remove links from `/admin`.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6 + Postgres, Clerk, next-intl (pl/en), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-multi-apartment-residency-design.md`

## Global Constraints

- `Membership` remains unique per `(userId, communityId)` and keeps the role; do not change that constraint.
- `Membership.apartmentId` is deprecated: leave existing values in the database (no nulling), never read it in application code, never write it from application code. `Membership.buildingId` is untouched.
- `ApartmentResidency` has `@@unique([userId, apartmentId])`, indexes on `userId` and `apartmentId`, and a denormalized `communityId`. No `kind`, flags or primary-contact columns (those are sub-project B).
- Invariant: a residency only exists for a user with a membership in the apartment's community. `addResidency` creates a `RESIDENT` membership when none exists and leaves an existing membership and its role untouched. Removing the last residency does not remove the membership. `removeMembership` also deletes the user's residencies in that community.
- Only ADMIN or MANAGER of the apartment's community can add or remove residencies. Every query filters by tenant (`communityId`).
- No global apartment switcher. Pages show everything across the user's apartments; forms that need one apartment show an apartment select only when the user has more than one.
- `memberships[0]` still selects the community (unchanged limitation).
- Every user-facing string exists in both `messages/en.json` and `messages/pl.json` with identical keys and placeholders (`i18n/messages.test.ts`). Placeholder regex is `/\{(\w+)/g`, so ICU plural branch text must not start with a word directly after `{`.
- Tests run against the local Postgres (`DATABASE_URL` in `.env`); `fileParallelism` is off. Do not run `next build` or touch `.next` while a dev server is running.
- Commit message trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

Create:
- `domain/residencies/index.ts` — `addResidency`, `removeResidency`, `listResidentApartments`.
- `domain/residencies/index.test.ts`.
- `auth/residency.test.ts` — `residentApartmentIds` unit test.
- `prisma/migrations/<timestamp>_add_apartment_residency/migration.sql` (generated, then hand-appended with the backfill).

Modify: `prisma/schema.prisma`, `prisma/seed.ts`, `auth/session.ts`, `domain/__test-helpers__/fixtures.ts`, `domain/audit/log.ts`, `domain/memberships/index.ts` (+ its test), `domain/packages/index.ts`, `domain/packages/reminders.ts`, `domain/reports/index.ts`, `domain/profile/index.ts`, `actions/memberships.ts`, `actions/reports.ts`, `components/admin/{CreateMembershipForm,MembershipsTable}.tsx`, `components/reports/{CreateReportForm,ReportsList}.tsx`, `app/reports/page.tsx`, `app/profile/page.tsx`, `app/page.tsx`, `messages/{en,pl}.json`, plus tests as listed per task.

---

### Task 1: Schema, migration with backfill, session and fixtures

**Files:**
- Modify: `prisma/schema.prisma`, `auth/session.ts`, `domain/__test-helpers__/fixtures.ts`
- Create: `prisma/migrations/<timestamp>_add_apartment_residency/migration.sql`, `auth/residency.test.ts`

**Interfaces:**
- Produces:
  - Prisma model `ApartmentResidency { id, userId, apartmentId, communityId, createdAt }` with relations `user`, `apartment`, `community`; back-relations `User.residencies`, `Apartment.residencies`, `Community.residencies`.
  - `SessionUser = User & { memberships: Membership[]; residencies: ApartmentResidency[] }`.
  - `residentApartmentIds(user: SessionUser, communityId: string): string[]` exported from `auth/session.ts`.
  - Fixture `createUserWithMembership({ ..., apartmentId })` returns a `SessionUser` whose `residencies` contains a residency for `apartmentId` when given (and, **temporarily until Task 7**, still also writes the legacy `Membership.apartmentId` so not-yet-migrated code and tests keep passing). `cleanupDatabase()` deletes residencies first.

- [ ] **Step 1: Write the failing unit test** (`auth/residency.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { residentApartmentIds, type SessionUser } from "@/auth/session";

const user = (residencies: { communityId: string; apartmentId: string }[]) =>
  ({ residencies }) as unknown as SessionUser;

describe("residentApartmentIds", () => {
  it("returns the apartment ids of the given community only", () => {
    const u = user([
      { communityId: "c1", apartmentId: "a1" },
      { communityId: "c1", apartmentId: "a2" },
      { communityId: "c2", apartmentId: "a3" },
    ]);
    expect(residentApartmentIds(u, "c1")).toEqual(["a1", "a2"]);
    expect(residentApartmentIds(u, "c2")).toEqual(["a3"]);
  });

  it("returns an empty list when the user has no residencies there", () => {
    expect(residentApartmentIds(user([]), "c1")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run auth/residency.test.ts`
Expected: FAIL — `residentApartmentIds` is not exported.

- [ ] **Step 3: Edit `prisma/schema.prisma`**

Add to `model User`: `residencies ApartmentResidency[]`. Add to `model Apartment`: `residencies ApartmentResidency[]`. Add to `model Community`: `residencies ApartmentResidency[]`.
In `model Membership`, put this comment line directly above the `apartmentId` field (keep the field):

```prisma
  // DEPRECATED: apartment links live in ApartmentResidency. Not read or written by the app.
```

Append at the end of the file:

```prisma
model ApartmentResidency {
  id          String   @id @default(cuid())
  userId      String
  apartmentId String
  communityId String
  createdAt   DateTime @default(now())

  user      User      @relation(fields: [userId], references: [id])
  apartment Apartment @relation(fields: [apartmentId], references: [id])
  community Community @relation(fields: [communityId], references: [id])

  @@unique([userId, apartmentId])
  @@index([userId])
  @@index([apartmentId])
}
```

- [ ] **Step 4: Create the migration without applying it, then append the backfill**

Run: `npx prisma migrate dev --create-only --name add_apartment_residency`
Then append this to the generated `prisma/migrations/*_add_apartment_residency/migration.sql` (after the generated statements, which already create the table, indexes and foreign keys):

```sql

-- Backfill: every membership that pointed at an apartment becomes a residency.
-- Membership."apartmentId" is deliberately left untouched (deprecated, kept for reversibility).
INSERT INTO "ApartmentResidency" ("id", "userId", "apartmentId", "communityId", "createdAt")
SELECT 'bf_' || m."id", m."userId", m."apartmentId", m."communityId", m."createdAt"
FROM "Membership" m
WHERE m."apartmentId" IS NOT NULL
ON CONFLICT ("userId", "apartmentId") DO NOTHING;
```

- [ ] **Step 5: Verify the backfill on the local database (manual check)**

Before applying, with the OLD generated client still in place, create a legacy row. Save this as `/private/tmp/claude-501/backfill-seed.ts` (outside the repo), run it with `npx tsx /private/tmp/claude-501/backfill-seed.ts` from the repo root:

```ts
import prisma from "@/lib/prisma";

async function main() {
  const community = await prisma.community.create({ data: { name: "Backfill Check" } });
  const building = await prisma.building.create({ data: { communityId: community.id, name: "B" } });
  const apartment = await prisma.apartment.create({ data: { buildingId: building.id, number: "7" } });
  const user = await prisma.user.create({
    data: { clerkUserId: "backfill-check", email: "backfill-check@example.com" },
  });
  await prisma.membership.create({
    data: { userId: user.id, communityId: community.id, buildingId: building.id, apartmentId: apartment.id, role: "RESIDENT" },
  });
  console.log("seeded", user.id, apartment.id);
}
main().finally(() => prisma.$disconnect());
```

Then apply: `npx prisma migrate dev` (applies the edited migration and regenerates the client). Verify with a second script `/private/tmp/claude-501/backfill-check.ts`:

```ts
import prisma from "@/lib/prisma";

async function main() {
  const rows = await prisma.apartmentResidency.findMany({ where: { user: { email: "backfill-check@example.com" } } });
  const membership = await prisma.membership.findFirstOrThrow({ where: { user: { email: "backfill-check@example.com" } } });
  console.log("residencies:", rows.length, "membership.apartmentId kept:", Boolean(membership.apartmentId));
}
main().finally(() => prisma.$disconnect());
```

Expected output: `residencies: 1 membership.apartmentId kept: true`. Record this output in your report. The seeded rows are removed by the next `cleanupDatabase()` (any test run).

- [ ] **Step 6: Edit `auth/session.ts`**

Add `ApartmentResidency` to the Prisma type import, replace the `SessionUser` type, add a shared include, use it in all three queries, and add the helper:

```ts
import { Prisma, type ApartmentResidency, type Membership, type Role, type User } from "@/lib/generated/prisma";

export type SessionUser = User & {
  memberships: Membership[];
  residencies: ApartmentResidency[];
};

const sessionInclude = {
  memberships: { orderBy: { createdAt: "asc" } },
  residencies: true,
} satisfies Prisma.UserInclude;
```

In `getCurrentUser` use `include: sessionInclude` for the `findUnique`; in `linkClerkUser` use `include: sessionInclude` for both the `update` and the `create`. Append:

```ts
export function residentApartmentIds(user: SessionUser, communityId: string): string[] {
  return user.residencies
    .filter((r) => r.communityId === communityId)
    .map((r) => r.apartmentId);
}
```

- [ ] **Step 7: Edit `domain/__test-helpers__/fixtures.ts`**

At the top of `cleanupDatabase()` add `await prisma.apartmentResidency.deleteMany();` (before the notification deletes). Replace the membership creation and return in `createUserWithMembership` with:

```ts
  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      communityId: params.communityId,
      buildingId: params.buildingId,
      // ponytail: legacy dual-write, removed in Task 7 once nothing reads Membership.apartmentId.
      apartmentId: params.apartmentId,
      role: params.role,
    },
  });
  const residencies = params.apartmentId
    ? [
        await prisma.apartmentResidency.create({
          data: { userId: user.id, apartmentId: params.apartmentId, communityId: params.communityId },
        }),
      ]
    : [];
  return { ...user, memberships: [membership], residencies };
```

- [ ] **Step 8: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (existing tests unaffected thanks to the dual-write; the new unit test passes). If `tsc` reports other places that build a `SessionUser` without `residencies`, add `residencies: []` there.

- [ ] **Step 9: Commit**

```bash
git add prisma auth domain
git commit -m "feat: add ApartmentResidency table, backfill and session residencies

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Commit `lib/generated` too if `git status` shows it modified; the client is tracked in this repo.)

---

### Task 2: Residencies domain, membership cleanup, audit actions

**Files:**
- Create: `domain/residencies/index.ts`, `domain/residencies/index.test.ts`
- Modify: `domain/audit/log.ts`, `domain/memberships/index.ts`, `domain/memberships/index.test.ts`

**Interfaces:**
- Consumes: Task 1 models and `residentApartmentIds`.
- Produces:
  - `addResidency(actor: SessionUser, input: { communityId: string; email: string; buildingId: string; apartmentId: string }): Promise<ApartmentResidency>`; throws `UnauthorizedError`, `TenantMismatchError`, `ValidationError` (already linked).
  - `removeResidency(actor: SessionUser, residencyId: string): Promise<void>`; throws `NotFoundError`, `UnauthorizedError`.
  - `listResidentApartments(actor: SessionUser, communityId: string): Promise<(Apartment & { building: Building })[]>` ordered by building name then apartment number.
  - `createMembership` no longer takes or writes `apartmentId`; `removeMembership` deletes the user's residencies in that community; `listMembershipsForCommunity` returns each membership with `user.residencies` (this community only, each with `apartment.building`) and `building`.
  - `AuditAction` gains `"RESIDENCY_ADDED" | "RESIDENCY_REMOVED"`.

- [ ] **Step 1: Write the failing tests** (`domain/residencies/index.test.ts`)

```ts
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { NotFoundError, TenantMismatchError, UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { removeMembership } from "@/domain/memberships";
import { addResidency, listResidentApartments, removeResidency } from "@/domain/residencies";

afterEach(async () => {
  await cleanupDatabase();
});

async function setup() {
  const base = await createCommunityWithBuildingAndApartment();
  const manager = await createUserWithMembership({ communityId: base.community.id, role: Role.MANAGER });
  return { ...base, manager };
}

describe("addResidency", () => {
  it("creates the user, a RESIDENT membership and the residency, with an audit entry", async () => {
    const { community, building, apartment, manager } = await setup();

    const residency = await addResidency(manager, {
      communityId: community.id,
      email: "new@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    expect(residency.apartmentId).toBe(apartment.id);
    expect(residency.communityId).toBe(community.id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "new@example.com" },
      include: { memberships: true },
    });
    expect(user.memberships).toHaveLength(1);
    expect(user.memberships[0].role).toBe(Role.RESIDENT);
    expect(user.memberships[0].apartmentId).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "RESIDENCY_ADDED", entityId: residency.id } })).toBe(1);
  });

  it("reuses an existing membership and keeps its role", async () => {
    const { community, building, apartment, manager } = await setup();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      role: Role.RECEPTIONIST,
      email: "desk@example.com",
    });

    await addResidency(manager, {
      communityId: community.id,
      email: "desk@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    const memberships = await prisma.membership.findMany({ where: { userId: receptionist.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe(Role.RECEPTIONIST);
    expect(await prisma.apartmentResidency.count({ where: { userId: receptionist.id } })).toBe(1);
  });

  it("links the same person to a second apartment", async () => {
    const { community, building, apartment, manager } = await setup();
    const second = await prisma.apartment.create({ data: { buildingId: building.id, number: "102" } });
    const input = { communityId: community.id, email: "owner@example.com", buildingId: building.id };

    await addResidency(manager, { ...input, apartmentId: apartment.id });
    await addResidency(manager, { ...input, apartmentId: second.id });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "owner@example.com" },
      include: { memberships: true, residencies: true },
    });
    expect(user.memberships).toHaveLength(1);
    expect(user.residencies.map((r) => r.apartmentId).sort()).toEqual([apartment.id, second.id].sort());
  });

  it("rejects linking the same person to the same apartment twice", async () => {
    const { community, building, apartment, manager } = await setup();
    const input = {
      communityId: community.id,
      email: "dup@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    };
    await addResidency(manager, input);
    await expect(addResidency(manager, input)).rejects.toThrow(ValidationError);
  });

  it("rejects an apartment that is not in the given building and community", async () => {
    const { community, manager } = await setup();
    const other = await createCommunityWithBuildingAndApartment();

    await expect(
      addResidency(manager, {
        communityId: community.id,
        email: "x@example.com",
        buildingId: other.building.id,
        apartmentId: other.apartment.id,
      }),
    ).rejects.toThrow(TenantMismatchError);
    expect(await prisma.apartmentResidency.count()).toBe(0);
  });

  it("rejects a manager of another community", async () => {
    const { community, building, apartment } = await setup();
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });

    await expect(
      addResidency(outsider, {
        communityId: community.id,
        email: "x@example.com",
        buildingId: building.id,
        apartmentId: apartment.id,
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects residents and receptionists", async () => {
    const { community, building, apartment } = await setup();
    for (const role of [Role.RESIDENT, Role.RECEPTIONIST]) {
      const actor = await createUserWithMembership({ communityId: community.id, role });
      await expect(
        addResidency(actor, {
          communityId: community.id,
          email: "x@example.com",
          buildingId: building.id,
          apartmentId: apartment.id,
        }),
      ).rejects.toThrow(UnauthorizedError);
    }
  });
});

describe("removeResidency", () => {
  it("deletes the residency, keeps the membership and writes an audit entry", async () => {
    const { community, building, apartment, manager } = await setup();
    const residency = await addResidency(manager, {
      communityId: community.id,
      email: "gone@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    await removeResidency(manager, residency.id);

    expect(await prisma.apartmentResidency.count()).toBe(0);
    expect(await prisma.membership.count({ where: { user: { email: "gone@example.com" } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "RESIDENCY_REMOVED", entityId: residency.id } })).toBe(1);
  });

  it("throws NotFoundError for an unknown id and UnauthorizedError for another community's manager", async () => {
    const { community, building, apartment, manager } = await setup();
    const residency = await addResidency(manager, {
      communityId: community.id,
      email: "keep@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });

    await expect(removeResidency(manager, "missing")).rejects.toThrow(NotFoundError);
    await expect(removeResidency(outsider, residency.id)).rejects.toThrow(UnauthorizedError);
    expect(await prisma.apartmentResidency.count()).toBe(1);
  });
});

describe("removeMembership", () => {
  it("also deletes the user's residencies in that community", async () => {
    const { community, building, apartment, manager } = await setup();
    await addResidency(manager, {
      communityId: community.id,
      email: "leaving@example.com",
      buildingId: building.id,
      apartmentId: apartment.id,
    });
    const membership = await prisma.membership.findFirstOrThrow({ where: { user: { email: "leaving@example.com" } } });

    await removeMembership(manager, membership.id);

    expect(await prisma.apartmentResidency.count()).toBe(0);
  });
});

describe("listResidentApartments", () => {
  it("returns only the user's apartments in that community, with their building", async () => {
    const { community, building, apartment } = await setup();
    const second = await prisma.apartment.create({ data: { buildingId: building.id, number: "102" } });
    await prisma.apartment.create({ data: { buildingId: building.id, number: "103" } });
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const residency = await prisma.apartmentResidency.create({
      data: { userId: resident.id, apartmentId: second.id, communityId: community.id },
    });
    const actor = { ...resident, residencies: [...resident.residencies, residency] };

    const apartments = await listResidentApartments(actor, community.id);

    expect(apartments.map((a) => a.number)).toEqual(["101", "102"]);
    expect(apartments[0].building.name).toBe("Building A");
    expect(await listResidentApartments(actor, "other-community")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/residencies`
Expected: FAIL — cannot resolve `@/domain/residencies`.

- [ ] **Step 3: Add the audit actions** (`domain/audit/log.ts`): add `| "RESIDENCY_ADDED"` and `| "RESIDENCY_REMOVED"` to the `AuditAction` union.

- [ ] **Step 4: Implement `domain/residencies/index.ts`**

```ts
import prisma from "@/lib/prisma";
import { requireMembership, residentApartmentIds, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, TenantMismatchError, ValidationError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

const MANAGE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

export async function addResidency(
  actor: SessionUser,
  input: { communityId: string; email: string; buildingId: string; apartmentId: string },
) {
  requireMembership(actor, input.communityId, MANAGE_ROLES);

  return prisma.$transaction(async (tx) => {
    const apartment = await tx.apartment.findUnique({
      where: { id: input.apartmentId },
      include: { building: true },
    });
    if (
      !apartment ||
      apartment.buildingId !== input.buildingId ||
      apartment.building.communityId !== input.communityId
    ) {
      throw new TenantMismatchError(
        `Apartment ${input.apartmentId} does not belong to building ${input.buildingId} in community ${input.communityId}`,
      );
    }

    const user =
      (await tx.user.findUnique({ where: { email: input.email } })) ??
      (await tx.user.create({
        data: { email: input.email, clerkUserId: `pending:${input.email}` },
      }));

    const membership = await tx.membership.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: input.communityId } },
    });
    if (!membership) {
      await tx.membership.create({
        data: {
          userId: user.id,
          communityId: input.communityId,
          buildingId: input.buildingId,
          role: Role.RESIDENT,
        },
      });
    }

    const existing = await tx.apartmentResidency.findUnique({
      where: { userId_apartmentId: { userId: user.id, apartmentId: input.apartmentId } },
    });
    if (existing) {
      throw new ValidationError(`User ${input.email} is already linked to apartment ${input.apartmentId}`);
    }

    const residency = await tx.apartmentResidency.create({
      data: { userId: user.id, apartmentId: input.apartmentId, communityId: input.communityId },
    });

    await writeAuditLog(tx, {
      communityId: input.communityId,
      userId: actor.id,
      action: "RESIDENCY_ADDED",
      entity: "ApartmentResidency",
      entityId: residency.id,
      metadata: { targetEmail: input.email, apartmentId: input.apartmentId },
    });

    return residency;
  });
}

export async function removeResidency(actor: SessionUser, residencyId: string) {
  const residency = await prisma.apartmentResidency.findUnique({ where: { id: residencyId } });
  if (!residency) throw new NotFoundError(`Residency ${residencyId} not found`);

  requireMembership(actor, residency.communityId, MANAGE_ROLES);

  await prisma.$transaction(async (tx) => {
    await tx.apartmentResidency.delete({ where: { id: residencyId } });
    await writeAuditLog(tx, {
      communityId: residency.communityId,
      userId: actor.id,
      action: "RESIDENCY_REMOVED",
      entity: "ApartmentResidency",
      entityId: residencyId,
      metadata: { apartmentId: residency.apartmentId, userId: residency.userId },
    });
  });
}

export async function listResidentApartments(actor: SessionUser, communityId: string) {
  const apartmentIds = residentApartmentIds(actor, communityId);
  if (apartmentIds.length === 0) return [];

  return prisma.apartment.findMany({
    where: { id: { in: apartmentIds } },
    include: { building: true },
    orderBy: [{ building: { name: "asc" } }, { number: "asc" }],
  });
}
```

- [ ] **Step 5: Update `domain/memberships/index.ts`**

In `createMembership`: remove `apartmentId?: string;` from the input type; replace the whole `if (input.apartmentId) { ... } else if (input.buildingId) { ... }` block with:

```ts
    if (input.buildingId) {
      const building = await tx.building.findUnique({ where: { id: input.buildingId } });
      if (!building || building.communityId !== input.communityId) {
        throw new TenantMismatchError(
          `Building ${input.buildingId} does not belong to community ${input.communityId}`,
        );
      }
    }
```

and remove the `apartmentId: input.apartmentId,` line from the `tx.membership.create` data. In `removeMembership`, inside the transaction and before `tx.membership.delete`, add:

```ts
    await tx.apartmentResidency.deleteMany({
      where: { userId: membership.userId, communityId: membership.communityId },
    });
```

Replace the `include` of `listMembershipsForCommunity` with:

```ts
    include: {
      building: true,
      user: {
        include: {
          residencies: {
            where: { communityId },
            include: { apartment: { include: { building: true } } },
          },
        },
      },
    },
```

In `domain/memberships/index.test.ts`, delete the line `apartmentId: apartment.id,` from the `createMembership(admin, {...})` call in the first test (and drop `apartment` from that test's destructuring if it becomes unused).

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run domain && npx tsc --noEmit`
Expected: PASS for domain tests. `tsc` will report that `components/admin/MembershipsTable.tsx` and `actions/memberships.ts` use removed fields (`membership.apartment`, `apartmentId` in `createMembership`): leave them for Task 6, but if they block the compile of the files you changed, report it. If `tsc` fails ONLY in those two files plus `app/admin/page.tsx`, that is expected here.

- [ ] **Step 7: Commit**

```bash
git add domain
git commit -m "feat: add residency domain and clean up memberships

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Packages and notification recipients read residencies

**Files:**
- Modify: `domain/packages/index.ts`, `domain/packages/reminders.ts`
- Test: `domain/packages/index.test.ts` (append), `domain/packages/reminders.test.ts` (append)

**Interfaces:**
- Consumes: `residentApartmentIds` (Task 1).
- Produces: `listPackagesForViewer` resident branch filters by `recipientUserId = actor.id OR apartmentId IN residentApartmentIds`; `resolvePackageRecipients` reads `ApartmentResidency` rows for the package's apartment (signature unchanged).

- [ ] **Step 1: Write the failing tests**

Append to `domain/packages/index.test.ts` (it already imports `prisma`, `Role`, fixtures, `createPackage`, `listPackagesForViewer`; add `createPackageScenario` to the fixtures import if missing):

```ts
describe("listPackagesForViewer with several apartments", () => {
  it("shows a resident the packages of every apartment they live in, and no others", async () => {
    const s = await createPackageScenario();
    const second = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "102" } });
    const third = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "103" } });
    await prisma.apartmentResidency.create({
      data: { userId: s.resident.id, apartmentId: second.id, communityId: s.community.id },
    });
    const resident = await prisma.user.findUniqueOrThrow({
      where: { id: s.resident.id },
      include: { memberships: true, residencies: true },
    });
    for (const apartmentId of [s.apartment.id, second.id, third.id]) {
      await createPackage(s.receptionist, {
        communityId: s.community.id,
        buildingId: s.building.id,
        apartmentId,
      });
    }

    const visible = await listPackagesForViewer(resident, s.community.id);

    expect(visible.map((p) => p.apartmentId).sort()).toEqual([s.apartment.id, second.id].sort());
  });
});
```

Append to `domain/packages/reminders.test.ts` (it already imports `prisma`, `createPackageScenario`, `createPackage` and has a `registerPackage` helper):

```ts
describe("recipients across several apartments", () => {
  it("notifies a person linked to a second apartment when a package arrives there", async () => {
    const s = await createPackageScenario();
    const second = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "102" } });
    await prisma.apartmentResidency.create({
      data: { userId: s.resident.id, apartmentId: second.id, communityId: s.community.id },
    });

    await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: second.id,
    });

    const rows = await prisma.notification.findMany({ where: { type: "PACKAGE_RECEIVED" } });
    expect(rows.map((r) => r.recipientUserId)).toEqual([s.resident.id]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run domain/packages`
Expected: the two new tests FAIL (the legacy `Membership.apartmentId` only points at the first apartment).

- [ ] **Step 3: Implement**

In `domain/packages/index.ts` add `residentApartmentIds` to the `@/auth/session` import. In `listPackagesForViewer`, replace

```ts
  const residentFilters: Prisma.PackageWhereInput[] = [
    { recipientUserId: actor.id },
  ];
  if (residentMembership.apartmentId) {
    residentFilters.push({ apartmentId: residentMembership.apartmentId });
  }
```

with

```ts
  const residentFilters: Prisma.PackageWhereInput[] = [
    { recipientUserId: actor.id },
  ];
  const apartmentIds = residentApartmentIds(actor, communityId);
  if (apartmentIds.length > 0) {
    residentFilters.push({ apartmentId: { in: apartmentIds } });
  }
```

(keep the `residentMembership` lookup and its `UnauthorizedError` guard as they are; it still proves the user belongs to the community).

In `domain/packages/reminders.ts` replace the body of `resolvePackageRecipients` after the `recipientUserId` early return with:

```ts
  const residents = await tx.apartmentResidency.findMany({
    where: { apartmentId: pkg.apartmentId },
    select: { userId: true },
  });
  return residents.map((r) => r.userId);
```

and drop `Role` from the `@/lib/generated/prisma` import in that file if it is no longer used (keep `PackageStatus`).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run domain/packages && npx tsc --noEmit`
Expected: PASS (tsc errors only in the Task 6 admin files are expected, see Task 2 Step 6).

- [ ] **Step 5: Commit**

```bash
git add domain/packages
git commit -m "feat: packages and recipients follow apartment residencies

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reports across several apartments

**Files:**
- Modify: `domain/reports/index.ts`, `actions/reports.ts`, `components/reports/CreateReportForm.tsx`, `components/reports/ReportsList.tsx`, `app/reports/page.tsx`, `messages/en.json`, `messages/pl.json`
- Test: `domain/reports/index.test.ts` (append)

**Interfaces:**
- Consumes: `residentApartmentIds`, `listResidentApartments`.
- Produces:
  - `createReport` input gains `apartmentId?: string`. For PRIVATE categories: no residency → `UnauthorizedError`; `apartmentId` defaults to the user's only apartment, else is required (`ValidationError`) and must be one of the user's apartments (`UnauthorizedError`); `Report.apartmentId`/`buildingId` come from that apartment. Parking/storage ownership means the space's apartment is one of the user's apartments (the chosen one for private reports), never null.
  - `listOwnedSpaces(actor, communityId)` returns spaces/units in any of the user's apartments.
  - `ReportsList` and `CreateReportForm` take `apartments: { id: string; label: string }[]` (label `"<building> / <number>"`) and still take `canFilePrivate`.
  - Message keys `reports.apartment` and `reports.apartmentPlaceholder` (en and pl).

- [ ] **Step 1: Write the failing tests** (append to `domain/reports/index.test.ts`; it already defines module-level `community`, `building`, `apartment`, `otherApartment`, `resident`, `neighbour`, `manager`, `privateInput()` and the needed imports — add `ValidationError` and `UnauthorizedError` to the existing errors import if missing)

```ts
describe("several apartments", () => {
  async function residentOfTwo() {
    const second = await prisma.apartment.create({ data: { buildingId: building.id, number: "303" } });
    const residency = await prisma.apartmentResidency.create({
      data: { userId: resident.id, apartmentId: second.id, communityId: community.id },
    });
    return { second, actor: { ...resident, residencies: [...resident.residencies, residency] } };
  }

  it("requires an explicit apartment when the user has more than one", async () => {
    const { actor } = await residentOfTwo();
    await expect(createReport(actor, privateInput())).rejects.toThrow(ValidationError);
  });

  it("files a private report for the chosen apartment and derives the building", async () => {
    const { second, actor } = await residentOfTwo();

    const report = await createReport(actor, { ...privateInput(), apartmentId: second.id });

    expect(report.apartmentId).toBe(second.id);
    expect(report.buildingId).toBe(building.id);
  });

  it("rejects an apartment the user does not live in", async () => {
    await expect(
      createReport(resident, { ...privateInput(), apartmentId: otherApartment.id }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("lists the spaces of every apartment the user lives in, and only those", async () => {
    const { second, actor } = await residentOfTwo();
    const a = await prisma.parkingSpace.create({ data: { communityId: community.id, apartmentId: apartment.id, number: "P-10" } });
    const b = await prisma.parkingSpace.create({ data: { communityId: community.id, apartmentId: second.id, number: "P-11" } });
    await prisma.parkingSpace.create({ data: { communityId: community.id, apartmentId: otherApartment.id, number: "P-12" } });

    const result = await listOwnedSpaces(actor, community.id);

    expect(result.parkingSpaces.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("only accepts a parking space that belongs to the chosen apartment", async () => {
    const { second, actor } = await residentOfTwo();
    const space = await prisma.parkingSpace.create({
      data: { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, number: "P-20" },
    });

    await expect(
      createReport(actor, {
        communityId: community.id,
        categoryKey: "own-parking",
        type: "DEFECT",
        title: "Brama",
        description: "Nie działa",
        apartmentId: second.id,
        parkingSpaceId: space.id,
      }),
    ).rejects.toThrow(TenantMismatchError);
  });
});
```

(Add `TenantMismatchError` to the errors import if it is missing. If `"own-parking"` does not allow type `DEFECT`, use the first type in its catalog entry in `domain/reports/catalog.ts`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run domain/reports/index.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Edit `domain/reports/index.ts`**

Add `residentApartmentIds` to the `@/auth/session` import. Add `apartmentId?: string;` to the `createReport` input type. Replace `const membership = membershipIn(actor, input.communityId);` with `membershipIn(actor, input.communityId);`. Replace

```ts
  const isPrivate = category.visibility === "PRIVATE";
  if (isPrivate && !membership.apartmentId) {
    throw new UnauthorizedError(`User ${actor.id} has no apartment to file a private report for`);
  }
```

with

```ts
  const residentApartments = residentApartmentIds(actor, input.communityId);
  const isPrivate = category.visibility === "PRIVATE";
  let apartmentId: string | undefined;
  if (isPrivate) {
    if (residentApartments.length === 0) {
      throw new UnauthorizedError(`User ${actor.id} has no apartment to file a private report for`);
    }
    apartmentId =
      input.apartmentId ?? (residentApartments.length === 1 ? residentApartments[0] : undefined);
    if (!apartmentId) throw new ValidationError("An apartment is required for this report");
    if (!residentApartments.includes(apartmentId)) {
      throw new UnauthorizedError(`User ${actor.id} does not live in apartment ${apartmentId}`);
    }
  }
  // Spaces must belong to the chosen apartment for private reports, else to any of the user's.
  const ownedApartments = apartmentId ? [apartmentId] : residentApartments;
```

In the transaction, replace both ownership conditions: for the parking space `space.apartmentId !== membership.apartmentId` becomes `!space.apartmentId || !ownedApartments.includes(space.apartmentId)`; for the storage unit `unit.apartmentId !== membership.apartmentId` becomes `!unit.apartmentId || !ownedApartments.includes(unit.apartmentId)`. Just before `const report = await tx.report.create(` add:

```ts
    const apartment = apartmentId
      ? await tx.apartment.findUnique({ where: { id: apartmentId }, select: { buildingId: true } })
      : null;
```

and replace the two data lines `buildingId: isPrivate ? membership.buildingId : null,` / `apartmentId: isPrivate ? membership.apartmentId : null,` with `buildingId: apartment?.buildingId ?? null,` / `apartmentId: apartmentId ?? null,`.

Replace `listOwnedSpaces` with:

```ts
export async function listOwnedSpaces(actor: SessionUser, communityId: string) {
  membershipIn(actor, communityId);
  const apartmentIds = residentApartmentIds(actor, communityId);
  if (apartmentIds.length === 0) return { parkingSpaces: [], storageUnits: [] };

  const [parkingSpaces, storageUnits] = await Promise.all([
    prisma.parkingSpace.findMany({
      where: { communityId, apartmentId: { in: apartmentIds } },
      orderBy: { number: "asc" },
    }),
    prisma.storageUnit.findMany({
      where: { communityId, apartmentId: { in: apartmentIds } },
      orderBy: { number: "asc" },
    }),
  ]);
  return { parkingSpaces, storageUnits };
}
```

- [ ] **Step 4: Edit `actions/reports.ts`**

Add `apartmentId: z.string().min(1).optional(),` to `createReportSchema` and `apartmentId: formData.get("apartmentId") || undefined,` to the `safeParse` input.

- [ ] **Step 5: Edit the UI**

`app/reports/page.tsx`: import `listResidentApartments` from `@/domain/residencies`; after the `listOwnedSpaces` call add

```tsx
  const apartments = (await listResidentApartments(user, membership.communityId)).map((a) => ({
    id: a.id,
    label: `${a.building.name} / ${a.number}`,
  }));
```

and replace `canFilePrivate={Boolean(membership.apartmentId)}` with `canFilePrivate={apartments.length > 0}`, adding `apartments={apartments}` to `<ReportsList>`.

`components/reports/ReportsList.tsx`: add `apartments: { id: string; label: string }[]` to the props type and destructure, and pass `apartments={apartments}` to `<CreateReportForm>`.

`components/reports/CreateReportForm.tsx`: add `apartments: { id: string; label: string }[]` to the props. Add state `const [apartmentId, setApartmentId] = useState(apartments.length === 1 ? apartments[0].id : "");`. Derive, below the `category` constant:

```tsx
  const visibleParking =
    apartments.length > 1 && apartmentId
      ? parkingSpaces.filter((s) => s.apartmentId === apartmentId)
      : parkingSpaces;
  const visibleStorage =
    apartments.length > 1 && apartmentId
      ? storageUnits.filter((u) => u.apartmentId === apartmentId)
      : storageUnits;
```

Change the category effect to use the visible lists and also depend on the chosen apartment: replace the two auto-pick lines with `setParkingSpaceId(category?.subject === "parking" && visibleParking.length === 1 ? visibleParking[0].id : "");` and `setStorageUnitId(category?.subject === "storage" && visibleStorage.length === 1 ? visibleStorage[0].id : "");`, and change the dependency array to `[categoryKey, apartmentId]` (keep the existing eslint-disable comment). In the JSX replace every use of `parkingSpaces` / `storageUnits` (the `.map(...)` lists and the `.length === 0` warnings) with `visibleParking` / `visibleStorage`. Add the hidden input `<input type="hidden" name="apartmentId" value={apartmentId} />` next to the other hidden inputs. Add, immediately before the `<Collapse show={category?.subject === "parking"}` block:

```tsx
            <Collapse show={apartments.length > 1 && Boolean(category)} className="-mx-1 -mt-1 mb-0!">
              <div className="space-y-2 px-1 pt-1 pb-4">
                <Label htmlFor="apartment">{t("apartment")}</Label>
                <Select value={apartmentId} onValueChange={setApartmentId}>
                  <SelectTrigger id="apartment">
                    <SelectValue placeholder={t("apartmentPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {apartments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Collapse>
```

Add to `messages/en.json` under `reports`: `"apartment": "Apartment"`, `"apartmentPlaceholder": "Choose an apartment"`; and to `messages/pl.json`: `"apartment": "Mieszkanie"`, `"apartmentPlaceholder": "Wybierz mieszkanie"`.

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npx vitest run domain/reports i18n && npx tsc --noEmit && npm run lint`
Expected: PASS (tsc errors only in the Task 6 admin files are expected here).

- [ ] **Step 7: Commit**

```bash
git add domain actions components app messages
git commit -m "feat: reports work across several apartments

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Profile and home page list every apartment

**Files:**
- Modify: `domain/profile/index.ts`, `domain/profile/index.test.ts`, `app/profile/page.tsx`, `app/page.tsx`, `messages/en.json`, `messages/pl.json`

**Interfaces:**
- Consumes: `listResidentApartments`, `listOwnedSpaces`.
- Produces: `getProfile(actor, communityId)` returns `apartments: { id: string; number: string; floor: number | null; building: { name: string; address: string | null } }[]` (replacing `apartment`), and `building` becomes only the membership's own building (staff assignment) or `null`. Message key `profile.apartmentCardNumbered` ("Apartment {number}" / "Mieszkanie {number}").

- [ ] **Step 1: Update the tests first** (`domain/profile/index.test.ts`)

- In "returns the member's apartment, building, parking spaces and storage units" replace `expect(profile.apartment).toEqual({ number: "101", floor: null });` with:

```ts
    expect(profile.apartments).toEqual([
      { id: apartment.id, number: "101", floor: null, building: { name: "Building A", address: null } },
    ]);
```

- In "returns null apartment and empty lists for staff without an apartment" replace `expect(profile.apartment).toBeNull();` with `expect(profile.apartments).toEqual([]);` (rename the test to "returns no apartments and empty lists for staff without an apartment").
- Replace the test "falls back to the apartment's building when the membership has none" with:

```ts
  it("returns the building of every apartment the member lives in", async () => {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const second = await prisma.apartment.create({ data: { buildingId: building.id, number: "102", floor: 2 } });
    const resident = await createUserWithMembership({
      communityId: community.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const residency = await prisma.apartmentResidency.create({
      data: { userId: resident.id, apartmentId: second.id, communityId: community.id },
    });

    const profile = await getProfile(
      { ...resident, residencies: [...resident.residencies, residency] },
      community.id,
    );

    expect(profile.apartments.map((a) => [a.number, a.building.name])).toEqual([
      ["101", "Building A"],
      ["102", "Building A"],
    ]);
    expect(profile.building).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run domain/profile`
Expected: FAIL (`profile.apartments` is undefined).

- [ ] **Step 3: Implement `domain/profile/index.ts`**

Add `import { listResidentApartments } from "@/domain/residencies";`. Replace the `Promise.all` and the returned object with:

```ts
  const [membership, owned, apartments] = await Promise.all([
    prisma.membership.findUniqueOrThrow({
      where: { id: own.id },
      include: { community: true, building: true },
    }),
    listOwnedSpaces(actor, communityId),
    listResidentApartments(actor, communityId),
  ]);

  return {
    firstName: actor.firstName,
    lastName: actor.lastName,
    email: actor.email,
    role: membership.role,
    community: { name: membership.community.name, address: membership.community.address },
    building: membership.building
      ? { name: membership.building.name, address: membership.building.address }
      : null,
    apartments: apartments.map((a) => ({
      id: a.id,
      number: a.number,
      floor: a.floor,
      building: { name: a.building.name, address: a.building.address },
    })),
    parkingSpaces: owned.parkingSpaces.map((s) => ({
      id: s.id,
      number: s.number,
      level: s.level,
      hasEvCharger: s.hasEvCharger,
    })),
    storageUnits: owned.storageUnits.map((u) => ({ id: u.id, number: u.number })),
  };
```

(delete the old `const building = ...` line).

- [ ] **Step 4: Update `app/profile/page.tsx`**

Replace the single `StaggerItem index={1}` apartment card with one card per apartment:

```tsx
        {p.apartments.length > 0 ? (
          p.apartments.map((a, i) => (
            <StaggerItem key={a.id} index={1 + i} className="md:col-span-2 h-full [&>*]:h-full">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {p.apartments.length > 1
                      ? t("apartmentCardNumbered", { number: a.number })
                      : t("apartmentCard")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Row label={t("community")} value={[p.community.name, p.community.address].filter(Boolean).join(", ")} />
                    <Row label={t("building")} value={[a.building.name, a.building.address].filter(Boolean).join(", ")} />
                    <Row label={t("apartment")} value={a.number} />
                    {a.floor != null && <Row label={t("floor")} value={String(a.floor)} />}
                  </dl>
                </CardContent>
              </Card>
            </StaggerItem>
          ))
        ) : (
          <StaggerItem index={1} className="md:col-span-2 h-full [&>*]:h-full">
            <Card>
              <CardHeader>
                <CardTitle>{t("apartmentCard")}</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState icon={Home} title={t("noApartmentTitle")} description={t("noApartmentHint")} />
              </CardContent>
            </Card>
          </StaggerItem>
        )}
```

and shift the parking and storage `StaggerItem` indexes to `index={2 + p.apartments.length}` and `index={3 + p.apartments.length}`.

- [ ] **Step 5: Update `app/page.tsx`**

Replace the `const apt = profile.apartment; const aptLine = ...` block with:

```tsx
  const extras = [
    profile.parkingSpaces.length &&
      t("parkingShort", { numbers: profile.parkingSpaces.map((x) => x.number).join(", ") }),
    profile.storageUnits.length &&
      t("storageShort", { numbers: profile.storageUnits.map((x) => x.number).join(", ") }),
  ]
    .filter(Boolean)
    .join(" · ");
  const aptLines = [
    ...profile.apartments.map((a) =>
      t("myApartmentLine", { building: a.building.name, apartment: a.number }),
    ),
    ...(extras ? [extras] : []),
  ];
```

and replace the `{aptLine && (...)}` card body: change the condition to `{profile.apartments.length > 0 && (` and the paragraph `<p className="text-sm">{aptLine}</p>` to

```tsx
            <ul className="space-y-1">
              {aptLines.map((line) => (
                <li key={line} className="text-sm">{line}</li>
              ))}
            </ul>
```

(`myApartmentNoBuilding` is no longer used by the page; leave the message key in place.)

- [ ] **Step 6: Add messages**

`messages/en.json` `profile`: `"apartmentCardNumbered": "Apartment {number}"`. `messages/pl.json` `profile`: `"apartmentCardNumbered": "Mieszkanie {number}"`.

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `npx vitest run domain/profile i18n && npx tsc --noEmit && npm run lint`
Expected: PASS (tsc errors only in the Task 6 admin files are expected here).

- [ ] **Step 8: Commit**

```bash
git add domain app messages
git commit -m "feat: profile and home page list every apartment

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Admin UI — add and remove apartment links

**Files:**
- Modify: `actions/memberships.ts`, `components/admin/CreateMembershipForm.tsx`, `components/admin/MembershipsTable.tsx`, `messages/en.json`, `messages/pl.json`
- (No change needed in `app/admin/page.tsx`; it passes `listMembershipsForCommunity` output to the table.)

**Interfaces:**
- Consumes: `addResidency`, `removeResidency`, `createMembership` (no `apartmentId`), `listMembershipsForCommunity` output (Task 2).
- Produces: `removeResidencyAction(residencyId: string): Promise<{ message: string; success: boolean }>`; `createMembershipAction` routes `RESIDENT` to `addResidency` (building and apartment required) and other roles to `createMembership` (building optional, no apartment). Message keys: `admin.buildingRequired`, `admin.apartmentRequired`, `admin.removeApartment` (`{name}`), `admin.actions.apartmentRequired`, `admin.actions.alreadyResident`, `admin.actions.residencyRemoved`.

- [ ] **Step 1: Edit `actions/memberships.ts`**

Imports: add `import { addResidency, removeResidency } from "@/domain/residencies";` and `ValidationError` to the errors import. Replace the body of `try` in `createMembershipAction` and extend the catch:

```ts
  try {
    const { role, buildingId, apartmentId, communityId, email } = validated.data;
    if (role === Role.RESIDENT) {
      if (!buildingId || !apartmentId) {
        return { message: t("apartmentRequired"), success: false };
      }
      await addResidency(actor, { communityId, email, buildingId, apartmentId });
    } else {
      await createMembership(actor, { communityId, email, buildingId, role });
    }
    revalidatePath("/admin");
    return { message: t("created"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: t("createForbidden"), success: false };
    }
    if (error instanceof TenantMismatchError) {
      return { message: t("tenantMismatch"), success: false };
    }
    if (error instanceof ValidationError) {
      return { message: t("alreadyResident"), success: false };
    }
    console.error(error);
    return { message: t("createFailed"), success: false };
  }
```

Append:

```ts
export async function removeResidencyAction(residencyId: string): Promise<ActionState> {
  const t = await getTranslations("admin.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await removeResidency(actor, residencyId);
    revalidatePath("/admin");
    return { message: t("residencyRemoved"), success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: t("notFound"), success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: t("removeForbidden"), success: false };
    }
    console.error(error);
    return { message: t("removeFailed"), success: false };
  }
}
```

- [ ] **Step 2: Edit `components/admin/CreateMembershipForm.tsx`**

Change the building label to `{role === Role.RESIDENT ? t("buildingRequired") : t("building")}` and the apartment block so it is only rendered for residents:

```tsx
            {role === Role.RESIDENT && (
              <div className="space-y-2">
                <Label htmlFor="apartmentId">{t("apartmentRequired")}</Label>
                <Select value={apartmentId} onValueChange={setApartmentId}>
                  <SelectTrigger id="apartmentId">
                    <SelectValue placeholder={t("none")} />
                  </SelectTrigger>
                  <SelectContent>
                    {apartments.map((apartment) => (
                      <SelectItem key={apartment.id} value={apartment.id}>
                        {apartment.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="apartmentId" value={apartmentId} />
              </div>
            )}
```

(replace the existing apartment `<div className="space-y-2">…</div>` block with this). Keep the rest of the form.

- [ ] **Step 3: Edit `components/admin/MembershipsTable.tsx`**

Import `X` from `lucide-react` (extend the existing import) and `removeResidencyAction` from `@/actions/memberships`. Change the row type:

```tsx
type MembershipRow = Membership & {
  user: User & {
    residencies: (ApartmentResidency & { apartment: Apartment & { building: Building } })[];
  };
  building: Building | null;
};
```

(add `ApartmentResidency` to the `@/lib/generated/prisma` import). Add a handler next to `handleRemove`:

```tsx
  const handleRemoveResidency = async (residencyId: string) => {
    setPendingId(residencyId);
    const result = await removeResidencyAction(residencyId);
    setPendingId(null);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };
```

Replace the apartment cell `<TableCell>{membership.apartment?.number ?? "—"}</TableCell>` with:

```tsx
              <TableCell>
                {membership.user.residencies.length === 0 ? (
                  "—"
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {membership.user.residencies.map((r) => {
                      const name = `${r.apartment.building.name} / ${r.apartment.number}`;
                      return (
                        <span
                          key={r.id}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm"
                        >
                          {name}
                          <button
                            type="button"
                            aria-label={t("removeApartment", { name })}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                            disabled={pendingId === r.id}
                            onClick={() => handleRemoveResidency(r.id)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </TableCell>
```

- [ ] **Step 4: Add messages**

`messages/en.json` under `admin`: `"buildingRequired": "Building"`, `"apartmentRequired": "Apartment"`, `"removeApartment": "Remove apartment {name}"`; under `admin.actions`: `"apartmentRequired": "Choose a building and an apartment for a resident"`, `"alreadyResident": "This person is already linked to that apartment"`, `"residencyRemoved": "Apartment removed from this person"`.
`messages/pl.json`: `"buildingRequired": "Budynek"`, `"apartmentRequired": "Mieszkanie"`, `"removeApartment": "Usuń mieszkanie {name}"`; actions: `"apartmentRequired": "Wybierz budynek i mieszkanie dla mieszkańca"`, `"alreadyResident": "Ta osoba jest już przypisana do tego mieszkania"`, `"residencyRemoved": "Mieszkanie zostało odpięte od tej osoby"`.

- [ ] **Step 5: Run everything**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all PASS; `tsc` is now fully clean (the admin files are the last consumers of the removed fields).

- [ ] **Step 6: Commit**

```bash
git add actions components messages
git commit -m "feat: manage apartment links from the admin page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Seed, legacy cleanup and verification

**Files:**
- Modify: `prisma/seed.ts`, `domain/__test-helpers__/fixtures.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: seed creates residencies; fixtures no longer write `Membership.apartmentId`, proving nothing reads it.

- [ ] **Step 1: Update `prisma/seed.ts`**

In the `residents` membership creation (the `Promise.all(residents.map(...))` block) remove `apartmentId: apartmentsByBuilding[0][i].id,` from the membership data, and add after that block:

```ts
  await Promise.all(
    residents.map((resident, i) =>
      prisma.apartmentResidency.create({
        data: {
          userId: resident.id,
          apartmentId: apartmentsByBuilding[0][i].id,
          communityId: community.id,
        },
      }),
    ),
  );
```

- [ ] **Step 2: Remove the legacy dual-write from the fixtures**

In `domain/__test-helpers__/fixtures.ts` delete the `// ponytail: legacy dual-write...` comment and the `apartmentId: params.apartmentId,` line from the `membership.create` data.

- [ ] **Step 3: Prove nothing reads the deprecated column**

Run: `grep -rnE "membership\.apartmentId|m\.apartmentId|\.apartmentId\b.*memberships|apartment: \{ include: \{ building" app actions components domain auth lib --include=*.ts --include=*.tsx | grep -v generated`
Then run: `grep -rn "apartmentId" app actions components domain auth --include=*.ts --include=*.tsx | grep -iE "membership" | grep -v "generated\|test"`
Expected: no application code reads or writes `Membership.apartmentId` (matches that are about `ApartmentResidency`, `Package`, `Report`, spaces or form fields are fine; list anything ambiguous in the report).

- [ ] **Step 4: Full verification**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all PASS with the fixtures no longer writing `Membership.apartmentId`. Do not run `next build` while a dev server is running.

- [ ] **Step 5: Commit**

```bash
git add prisma domain
git commit -m "chore: seed residencies and drop the legacy apartment dual-write

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual check against the local database** (`npm run dev`, then in the browser, if Clerk sign-in is available)

1. As a manager open `/admin`, add `resident-a@example.com` as Resident with building A / apartment 1, then add the same email again with apartment 2: the table shows two apartment chips for that person.
2. Remove one chip: only that link disappears and the membership stays.
3. Sign in as that resident: `/profile` shows two apartment cards, `/packages` lists packages for both apartments, and the new-report dialog shows an apartment select.

Report honestly which of these were run; do not claim them passed unless executed.
