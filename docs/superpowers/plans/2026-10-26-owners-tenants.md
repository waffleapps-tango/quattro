# Owners, tenants and package recipients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apartments get owners and tenants: owners manage their own tenants, reception picks the package recipient (with a primary-contact default), and people can opt out of being notified.

**Architecture:** `ApartmentResidency` (from the multi-apartment change) gains `kind` (OWNER/TENANT), `livesHereOverride`, `receivesPackages` and `isPrimary`. One pure function (`effectiveResidents`) defines who "lives here"; recipient resolution, the reception select and the profile UI all use it. Owner powers come from the `OWNER` link (not from `Membership.role`).

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6 + Postgres, Clerk, next-intl (pl/en), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-owners-tenants-design.md`

## Global Constraints

- `ApartmentResidency.kind` is `OWNER` or `TENANT`. The migration sets every existing link to `OWNER` (add the column with default `'OWNER'`, then drop the default) so new links must state their kind.
- At most one primary contact per apartment (partial unique index `ON "ApartmentResidency"("apartmentId") WHERE "isPrimary"`).
- Effective "lives here": a tenant always lives there. An owner lives there if `livesHereOverride` is true; if it is null, only while the apartment has no `TENANT` link; if false, never.
- "All residents" = linked people who effectively live there and have `receivesPackages` on. Select options = everyone linked with `receivesPackages` on (an owner who does not live there is selectable). Default = the primary contact if one is set and still receives packages, else "All residents". The default is resolved when the package is created: a primary contact is stored as `Package.recipientUserId`; "All residents" leaves it empty.
- Package visibility is unchanged: anyone linked to the apartment sees its packages.
- Permissions: only admin/manager add or remove OWNER links; an owner of the apartment (or admin/manager) adds/removes TENANT links and sets the primary contact; the link's own user (or admin/manager) edits `receivesPackages` and `livesHereOverride`; `livesHereOverride` is valid on OWNER links only. Turning `receivesPackages` off clears `isPrimary` on that link. The primary-contact target must belong to the apartment and have `receivesPackages` on.
- Owner powers come from the OWNER link; `Membership` and its role stay unchanged. Every query filters by tenant (`communityId`).
- A tenant sees co-residents' names and kinds only (no emails); owners see full details.
- Every user-facing string exists in both `messages/en.json` and `messages/pl.json` with identical keys and placeholders (`i18n/messages.test.ts`). The placeholder regex is `/\{(\w+)/g`, so ICU plural branch text must not start with a word right after `{`.
- Out of scope: lease dates, owners seeing tenants' private reports, community switcher, other notification channels.
- Tests run against the local Postgres (`DATABASE_URL` in `.env`); `fileParallelism` is off. Never run commands against `.env.gcp` / the GCP database; do not run `next build` or touch `.next` while a dev server is running; do not run the seed script.
- Commit message trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

Create:
- `domain/residencies/occupancy.ts` (+ `occupancy.test.ts`) — pure "lives here" rules.
- `domain/residencies/access.ts` — permission helpers.
- `domain/residencies/prefs.ts` (+ `prefs.test.ts`) — `updateResidencyPrefs`, `setPrimaryContact`.
- `domain/residencies/recipients.ts` (+ `recipients.test.ts`) — `getPackageRecipientOptions`.
- `domain/residencies/tenants.test.ts` — `addTenant` / `removeResidency` permission tests.
- `actions/residencies.ts` — `addTenantAction`, `updateResidencyPrefsAction`, `setPrimaryContactAction`.
- `components/profile/ApartmentPeople.tsx`.
- `prisma/migrations/<timestamp>_add_residency_kind_and_prefs/migration.sql` (generated, then hand-edited).

Modify: `prisma/schema.prisma`, `prisma/seed.ts`, `domain/audit/log.ts`, `domain/__test-helpers__/fixtures.ts`, `domain/residencies/index.ts`, `domain/packages/index.ts`, `domain/packages/reminders.ts`, `domain/profile/index.ts`, `actions/packages.ts`, `actions/memberships.ts`, `components/packages/CreatePackageForm.tsx`, `components/admin/{CreateMembershipForm,MembershipsTable}.tsx`, `app/profile/page.tsx`, `messages/{en,pl}.json`, and existing tests that create residencies directly.

---

### Task 1: Schema, migration, occupancy rules, kind plumbing

**Files:**
- Modify: `prisma/schema.prisma`, `domain/audit/log.ts`, `domain/__test-helpers__/fixtures.ts`, `domain/residencies/index.ts`, `actions/memberships.ts`, `prisma/seed.ts` (type fix only), and every existing test/script that calls `prisma.apartmentResidency.create` or `addResidency` (tsc lists them)
- Create: `domain/residencies/occupancy.ts`, `domain/residencies/occupancy.test.ts`, the migration

**Interfaces:**
- Produces:
  - Prisma enum `ResidencyKind { OWNER TENANT }`; `ApartmentResidency` fields `kind ResidencyKind` (required, no default), `livesHereOverride Boolean?`, `receivesPackages Boolean @default(true)`, `isPrimary Boolean @default(false)`.
  - `livesHere(link: { kind: ResidencyKind; livesHereOverride: boolean | null }, apartmentHasTenant: boolean): boolean` and `effectiveResidents<T extends { kind: ResidencyKind; livesHereOverride: boolean | null; receivesPackages: boolean }>(links: T[]): T[]` from `domain/residencies/occupancy.ts`.
  - `addResidency(actor, input: { communityId; email; buildingId; apartmentId; kind: ResidencyKind })` (kind now required; stored on the link and recorded in the audit metadata).
  - Fixture `createUserWithMembership({ ..., kind?: ResidencyKind })` (default `OWNER`) creating the residency with that kind.
  - `AuditAction` gains `"RESIDENCY_PREFS_CHANGED" | "PRIMARY_CONTACT_CHANGED"`.

- [ ] **Step 1: Write the failing tests** (`domain/residencies/occupancy.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { effectiveResidents, livesHere } from "@/domain/residencies/occupancy";

type Link = {
  userId: string;
  kind: "OWNER" | "TENANT";
  livesHereOverride: boolean | null;
  receivesPackages: boolean;
};
const link = (o: Partial<Link> = {}): Link => ({
  userId: "u",
  kind: "OWNER",
  livesHereOverride: null,
  receivesPackages: true,
  ...o,
});

describe("livesHere", () => {
  it("a tenant always lives there", () => {
    expect(livesHere(link({ kind: "TENANT" }), true)).toBe(true);
    expect(livesHere(link({ kind: "TENANT", livesHereOverride: false }), true)).toBe(true);
  });

  it("an owner lives there only while there are no tenants, unless overridden", () => {
    expect(livesHere(link(), false)).toBe(true);
    expect(livesHere(link(), true)).toBe(false);
    expect(livesHere(link({ livesHereOverride: true }), true)).toBe(true);
    expect(livesHere(link({ livesHereOverride: false }), false)).toBe(false);
  });
});

describe("effectiveResidents", () => {
  it("returns the owner alone when there are no tenants", () => {
    const owner = link({ userId: "o" });
    expect(effectiveResidents([owner]).map((l) => l.userId)).toEqual(["o"]);
  });

  it("drops the owner once a tenant exists, unless the owner says they live there too", () => {
    const owner = link({ userId: "o" });
    const tenant = link({ userId: "t", kind: "TENANT" });
    expect(effectiveResidents([owner, tenant]).map((l) => l.userId)).toEqual(["t"]);
    const living = link({ userId: "o", livesHereOverride: true });
    expect(effectiveResidents([living, tenant]).map((l) => l.userId).sort()).toEqual(["o", "t"]);
  });

  it("drops people who opted out of package notifications", () => {
    const optedOut = link({ userId: "x", receivesPackages: false });
    expect(effectiveResidents([optedOut])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/residencies/occupancy.test.ts`
Expected: FAIL — cannot resolve `@/domain/residencies/occupancy`.

- [ ] **Step 3: Implement `domain/residencies/occupancy.ts`**

```ts
import type { ResidencyKind } from "@/lib/generated/prisma";

type OccupancyLink = {
  kind: ResidencyKind;
  livesHereOverride: boolean | null;
};

// Single definition of "who lives here": used by recipient resolution, the reception
// select and the profile UI.
export function livesHere(link: OccupancyLink, apartmentHasTenant: boolean): boolean {
  if (link.kind === "TENANT") return true;
  return link.livesHereOverride ?? !apartmentHasTenant;
}

// "All residents": linked people who effectively live there and accept package notifications.
export function effectiveResidents<T extends OccupancyLink & { receivesPackages: boolean }>(
  links: T[],
): T[] {
  const hasTenant = links.some((l) => l.kind === "TENANT");
  return links.filter((l) => l.receivesPackages && livesHere(l, hasTenant));
}
```

- [ ] **Step 4: Edit `prisma/schema.prisma`**

Add the enum and the four fields:

```prisma
enum ResidencyKind {
  OWNER
  TENANT
}
```

In `model ApartmentResidency` add, after `communityId`:

```prisma
  kind              ResidencyKind
  livesHereOverride Boolean?
  receivesPackages  Boolean       @default(true)
  isPrimary         Boolean       @default(false)
```

- [ ] **Step 5: Create the migration, hand-edit it, apply**

Run: `npx prisma migrate dev --create-only --name add_residency_kind_and_prefs`
Then **replace the generated SQL file's content** with exactly:

```sql
-- CreateEnum
CREATE TYPE "ResidencyKind" AS ENUM ('OWNER', 'TENANT');

-- Existing links become owners: add with a default, then drop it so new links must state their kind.
ALTER TABLE "ApartmentResidency"
  ADD COLUMN "kind" "ResidencyKind" NOT NULL DEFAULT 'OWNER',
  ADD COLUMN "livesHereOverride" BOOLEAN,
  ADD COLUMN "receivesPackages" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ApartmentResidency" ALTER COLUMN "kind" DROP DEFAULT;

-- At most one primary contact per apartment.
CREATE UNIQUE INDEX "ApartmentResidency_apartmentId_primary_key"
  ON "ApartmentResidency"("apartmentId") WHERE "isPrimary";
```

Apply it: `npx prisma migrate dev`. Then run `npx prisma migrate dev` once more.
Expected the second time: "Already in sync" / no new migration generated. **If Prisma generates a new migration that drops `ApartmentResidency_apartmentId_primary_key`** (it cannot see partial indexes), delete that generated migration, and instead remove the `CREATE UNIQUE INDEX` statement from this migration file only if it was not yet applied (otherwise leave the index and report it): the fallback is that `setPrimaryContact` (Task 2) clears other primaries inside its transaction, which already guarantees the invariant at application level. Report which situation occurred.

- [ ] **Step 6: Audit actions, fixtures and `addResidency`**

`domain/audit/log.ts`: add `| "RESIDENCY_PREFS_CHANGED"` and `| "PRIMARY_CONTACT_CHANGED"` to `AuditAction`.

`domain/__test-helpers__/fixtures.ts`: import `type ResidencyKind` from `@/lib/generated/prisma`; add `kind?: ResidencyKind;` to the `createUserWithMembership` params and create the residency with `kind: params.kind ?? "OWNER"`.

`domain/residencies/index.ts`: import `type ResidencyKind` from `@/lib/generated/prisma`; add `kind: ResidencyKind` to the `addResidency` input type; add `kind: input.kind` to the `tx.apartmentResidency.create` data; add `kind: input.kind` to the audit `metadata`.

`actions/memberships.ts`: in the `addResidency(actor, { communityId, email, buildingId, apartmentId })` call add `kind: "OWNER"` followed by the comment `// ponytail: Task 7 replaces this with the admin form's kind select.`

- [ ] **Step 7: Fix compile errors in existing code**

Run: `npx tsc --noEmit`. Every error is a `prisma.apartmentResidency.create` (or `addResidency`) call missing the now-required `kind`: add `kind: "OWNER"` at each (tests, `prisma/seed.ts`, scratch code). Do not change anything else.

- [ ] **Step 8: Run everything**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS (all previous tests unchanged in meaning, plus the new occupancy tests).

- [ ] **Step 9: Commit**

```bash
git add prisma domain actions auth app components
git commit -m "feat: add residency kind, notification prefs and occupancy rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Include `lib/generated` if `git status` shows it modified; the client is tracked.)

---

### Task 2: Preferences and primary contact

**Files:**
- Create: `domain/residencies/access.ts`, `domain/residencies/prefs.ts`, `domain/residencies/prefs.test.ts`

**Interfaces:**
- Consumes: Task 1 models, `AuditAction` additions.
- Produces:
  - `domain/residencies/access.ts`: `MANAGE_ROLES: Role[]` (`ADMIN`, `MANAGER`), `isCommunityManager(actor, communityId): boolean`, `isApartmentOwner(actor, apartmentId): boolean`, `canManageApartment(actor, communityId, apartmentId): boolean`.
  - `updateResidencyPrefs(actor, residencyId, input: { receivesPackages?: boolean; livesHereOverride?: boolean | null }): Promise<ApartmentResidency>`; throws `NotFoundError`, `UnauthorizedError`, `ValidationError` (override on a non-owner link).
  - `setPrimaryContact(actor, apartmentId, residencyId: string | null): Promise<void>`; throws `NotFoundError` (unknown apartment), `UnauthorizedError`, `TenantMismatchError` (target not in that apartment or not found), `ValidationError` (target has `receivesPackages` off).

- [ ] **Step 1: Write the failing tests** (`domain/residencies/prefs.test.ts`)

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import {
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { setPrimaryContact, updateResidencyPrefs } from "@/domain/residencies/prefs";

afterEach(async () => {
  await cleanupDatabase();
});

let community: { id: string };
let building: { id: string };
let apartment: { id: string };
let owner: SessionUser;
let tenant: SessionUser;
let manager: SessionUser;
let ownerLink: { id: string };
let tenantLink: { id: string };

const linkOf = (userId: string) =>
  prisma.apartmentResidency.findFirstOrThrow({ where: { userId } });

beforeEach(async () => {
  const base = await createCommunityWithBuildingAndApartment();
  community = base.community;
  building = base.building;
  apartment = base.apartment;
  const common = { communityId: community.id, buildingId: building.id, apartmentId: apartment.id };
  owner = await createUserWithMembership({ ...common, role: Role.RESIDENT, kind: "OWNER" });
  tenant = await createUserWithMembership({ ...common, role: Role.RESIDENT, kind: "TENANT" });
  manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });
  ownerLink = await linkOf(owner.id);
  tenantLink = await linkOf(tenant.id);
});

describe("updateResidencyPrefs", () => {
  it("lets a person opt out, which also clears their primary-contact flag", async () => {
    await prisma.apartmentResidency.update({ where: { id: tenantLink.id }, data: { isPrimary: true } });

    const updated = await updateResidencyPrefs(tenant, tenantLink.id, { receivesPackages: false });

    expect(updated.receivesPackages).toBe(false);
    expect(updated.isPrimary).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "RESIDENCY_PREFS_CHANGED", entityId: tenantLink.id } })).toBe(1);
  });

  it("lets an owner set and clear the lives-here override", async () => {
    const set = await updateResidencyPrefs(owner, ownerLink.id, { livesHereOverride: true });
    expect(set.livesHereOverride).toBe(true);
    const cleared = await updateResidencyPrefs(owner, ownerLink.id, { livesHereOverride: null });
    expect(cleared.livesHereOverride).toBeNull();
  });

  it("rejects the override on a tenant link", async () => {
    await expect(
      updateResidencyPrefs(tenant, tenantLink.id, { livesHereOverride: true }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects changing someone else's link, but allows a manager", async () => {
    await expect(
      updateResidencyPrefs(tenant, ownerLink.id, { receivesPackages: false }),
    ).rejects.toThrow(UnauthorizedError);
    const updated = await updateResidencyPrefs(manager, ownerLink.id, { receivesPackages: false });
    expect(updated.receivesPackages).toBe(false);
  });

  it("rejects a manager of another community and an unknown link", async () => {
    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });
    await expect(
      updateResidencyPrefs(outsider, ownerLink.id, { receivesPackages: false }),
    ).rejects.toThrow(UnauthorizedError);
    await expect(updateResidencyPrefs(owner, "missing", { receivesPackages: false })).rejects.toThrow(NotFoundError);
  });
});

describe("setPrimaryContact", () => {
  it("lets an owner set a tenant as primary and keeps only one primary", async () => {
    await setPrimaryContact(owner, apartment.id, tenantLink.id);
    await setPrimaryContact(owner, apartment.id, ownerLink.id);

    const links = await prisma.apartmentResidency.findMany({ where: { apartmentId: apartment.id } });
    expect(links.filter((l) => l.isPrimary).map((l) => l.id)).toEqual([ownerLink.id]);
    expect(await prisma.auditLog.count({ where: { action: "PRIMARY_CONTACT_CHANGED" } })).toBe(2);
  });

  it("clears the primary contact with null", async () => {
    await setPrimaryContact(owner, apartment.id, tenantLink.id);
    await setPrimaryContact(owner, apartment.id, null);
    expect(await prisma.apartmentResidency.count({ where: { apartmentId: apartment.id, isPrimary: true } })).toBe(0);
  });

  it("allows a manager and rejects a tenant, a stranger and another community's manager", async () => {
    await setPrimaryContact(manager, apartment.id, ownerLink.id);
    await expect(setPrimaryContact(tenant, apartment.id, tenantLink.id)).rejects.toThrow(UnauthorizedError);

    const stray = await createUserWithMembership({ communityId: community.id, role: Role.RESIDENT });
    await expect(setPrimaryContact(stray, apartment.id, ownerLink.id)).rejects.toThrow(UnauthorizedError);

    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });
    await expect(setPrimaryContact(outsider, apartment.id, ownerLink.id)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a target from another apartment, an opted-out target and an unknown apartment", async () => {
    const secondApartment = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const neighbour = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: secondApartment.id,
      role: Role.RESIDENT,
    });
    const neighbourLink = await linkOf(neighbour.id);
    await expect(setPrimaryContact(owner, apartment.id, neighbourLink.id)).rejects.toThrow(TenantMismatchError);

    await prisma.apartmentResidency.update({ where: { id: tenantLink.id }, data: { receivesPackages: false } });
    await expect(setPrimaryContact(owner, apartment.id, tenantLink.id)).rejects.toThrow(ValidationError);

    await expect(setPrimaryContact(owner, "missing", null)).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/residencies/prefs.test.ts`
Expected: FAIL — cannot resolve `@/domain/residencies/prefs`.

- [ ] **Step 3: Implement `domain/residencies/access.ts`**

```ts
import type { SessionUser } from "@/auth/session";
import { Role } from "@/lib/generated/prisma";

export const MANAGE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

export function isCommunityManager(actor: SessionUser, communityId: string): boolean {
  return actor.memberships.some(
    (m) => m.communityId === communityId && MANAGE_ROLES.includes(m.role),
  );
}

export function isApartmentOwner(actor: SessionUser, apartmentId: string): boolean {
  return actor.residencies.some((r) => r.apartmentId === apartmentId && r.kind === "OWNER");
}

// Owners manage their own apartment; admins and managers manage any apartment in their community.
export function canManageApartment(
  actor: SessionUser,
  communityId: string,
  apartmentId: string,
): boolean {
  return isCommunityManager(actor, communityId) || isApartmentOwner(actor, apartmentId);
}
```

- [ ] **Step 4: Implement `domain/residencies/prefs.ts`**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import {
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import { canManageApartment, isCommunityManager } from "./access";

export async function updateResidencyPrefs(
  actor: SessionUser,
  residencyId: string,
  input: { receivesPackages?: boolean; livesHereOverride?: boolean | null },
) {
  const residency = await prisma.apartmentResidency.findUnique({ where: { id: residencyId } });
  if (!residency) throw new NotFoundError(`Residency ${residencyId} not found`);

  const isSelf = residency.userId === actor.id;
  if (!isSelf && !isCommunityManager(actor, residency.communityId)) {
    throw new UnauthorizedError(`User ${actor.id} may not edit residency ${residencyId}`);
  }
  if (input.livesHereOverride !== undefined && residency.kind !== "OWNER") {
    throw new ValidationError("livesHereOverride is only valid on owner links");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.apartmentResidency.update({
      where: { id: residencyId },
      data: {
        ...(input.receivesPackages !== undefined ? { receivesPackages: input.receivesPackages } : {}),
        ...(input.livesHereOverride !== undefined ? { livesHereOverride: input.livesHereOverride } : {}),
        // Someone who stops receiving packages cannot stay the default recipient.
        ...(input.receivesPackages === false ? { isPrimary: false } : {}),
      },
    });
    await writeAuditLog(tx, {
      communityId: residency.communityId,
      userId: actor.id,
      action: "RESIDENCY_PREFS_CHANGED",
      entity: "ApartmentResidency",
      entityId: residencyId,
      metadata: { ...input },
    });
    return updated;
  });
}

export async function setPrimaryContact(
  actor: SessionUser,
  apartmentId: string,
  residencyId: string | null,
) {
  const apartment = await prisma.apartment.findUnique({
    where: { id: apartmentId },
    include: { building: true },
  });
  if (!apartment) throw new NotFoundError(`Apartment ${apartmentId} not found`);
  const communityId = apartment.building.communityId;

  if (!canManageApartment(actor, communityId, apartmentId)) {
    throw new UnauthorizedError(
      `User ${actor.id} may not set the primary contact of apartment ${apartmentId}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (residencyId) {
      const target = await tx.apartmentResidency.findUnique({ where: { id: residencyId } });
      if (!target || target.apartmentId !== apartmentId) {
        throw new TenantMismatchError(`Residency ${residencyId} does not belong to apartment ${apartmentId}`);
      }
      if (!target.receivesPackages) {
        throw new ValidationError("The primary contact must receive package notifications");
      }
    }

    await tx.apartmentResidency.updateMany({
      where: { apartmentId, isPrimary: true },
      data: { isPrimary: false },
    });
    if (residencyId) {
      await tx.apartmentResidency.update({ where: { id: residencyId }, data: { isPrimary: true } });
    }

    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "PRIMARY_CONTACT_CHANGED",
      entity: "Apartment",
      entityId: apartmentId,
      metadata: { residencyId },
    });
  });
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run domain/residencies && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add domain
git commit -m "feat: residency preferences and primary contact

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tenants — `addTenant` and owner-scoped removal

**Files:**
- Modify: `domain/residencies/index.ts` (replace entirely, see below)
- Test: `domain/residencies/tenants.test.ts` (create)

**Interfaces:**
- Consumes: `canManageApartment`, `isApartmentOwner`, `isCommunityManager`, `MANAGE_ROLES` (Task 2); `addResidency` with `kind` (Task 1).
- Produces:
  - `addTenant(actor: SessionUser, input: { apartmentId: string; email: string }): Promise<ApartmentResidency>` — actor must own the apartment or be admin/manager of its community; throws `NotFoundError` (unknown apartment), `UnauthorizedError`, `ValidationError` (already linked).
  - `removeResidency(actor, residencyId)` — admin/manager: any link; an owner of the apartment: `TENANT` links only (`UnauthorizedError` otherwise).
  - `addResidency` and `listResidentApartments` behave as before.

- [ ] **Step 1: Write the failing tests** (`domain/residencies/tenants.test.ts`)

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { addTenant, removeResidency } from "@/domain/residencies";

afterEach(async () => {
  await cleanupDatabase();
});

let community: { id: string };
let building: { id: string };
let apartment: { id: string };
let owner: SessionUser;
let manager: SessionUser;

beforeEach(async () => {
  const base = await createCommunityWithBuildingAndApartment();
  community = base.community;
  building = base.building;
  apartment = base.apartment;
  owner = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    apartmentId: apartment.id,
    role: Role.RESIDENT,
    kind: "OWNER",
  });
  manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });
});

describe("addTenant", () => {
  it("lets an owner add a tenant: user, RESIDENT membership and TENANT link, with an audit entry", async () => {
    const link = await addTenant(owner, { apartmentId: apartment.id, email: "tenant@example.com" });

    expect(link.kind).toBe("TENANT");
    expect(link.apartmentId).toBe(apartment.id);
    expect(link.communityId).toBe(community.id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "tenant@example.com" },
      include: { memberships: true },
    });
    expect(user.memberships.map((m) => m.role)).toEqual([Role.RESIDENT]);
    const audit = await prisma.auditLog.findMany({ where: { action: "RESIDENCY_ADDED", entityId: link.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ kind: "TENANT" });
  });

  it("lets an admin or manager add a tenant", async () => {
    const link = await addTenant(manager, { apartmentId: apartment.id, email: "t2@example.com" });
    expect(link.kind).toBe("TENANT");
  });

  it("rejects a duplicate link", async () => {
    await addTenant(owner, { apartmentId: apartment.id, email: "dup@example.com" });
    await expect(
      addTenant(owner, { apartmentId: apartment.id, email: "dup@example.com" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a tenant, an owner of another apartment and another community's manager", async () => {
    const tenantLink = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    const tenantUser = await prisma.user.findUniqueOrThrow({
      where: { email: "t@example.com" },
      include: { memberships: true, residencies: true },
    });
    expect(tenantLink.kind).toBe("TENANT");
    await expect(
      addTenant(tenantUser, { apartmentId: apartment.id, email: "x@example.com" }),
    ).rejects.toThrow(UnauthorizedError);

    const otherApartment = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const otherOwner = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: otherApartment.id,
      role: Role.RESIDENT,
      kind: "OWNER",
    });
    await expect(
      addTenant(otherOwner, { apartmentId: apartment.id, email: "x@example.com" }),
    ).rejects.toThrow(UnauthorizedError);

    const other = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.MANAGER });
    await expect(
      addTenant(outsider, { apartmentId: apartment.id, email: "x@example.com" }),
    ).rejects.toThrow(UnauthorizedError);
    expect(await prisma.user.count({ where: { email: "x@example.com" } })).toBe(0);
  });

  it("throws NotFoundError for an unknown apartment", async () => {
    await expect(addTenant(owner, { apartmentId: "missing", email: "x@example.com" })).rejects.toThrow(NotFoundError);
  });
});

describe("removeResidency permissions", () => {
  it("lets an owner remove a tenant but not an owner link", async () => {
    const tenantLink = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    const ownerLink = await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: owner.id } });

    await removeResidency(owner, tenantLink.id);
    expect(await prisma.apartmentResidency.count({ where: { id: tenantLink.id } })).toBe(0);

    await expect(removeResidency(owner, ownerLink.id)).rejects.toThrow(UnauthorizedError);
    expect(await prisma.apartmentResidency.count({ where: { id: ownerLink.id } })).toBe(1);
  });

  it("lets a manager remove an owner link", async () => {
    const ownerLink = await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: owner.id } });
    await removeResidency(manager, ownerLink.id);
    expect(await prisma.apartmentResidency.count({ where: { id: ownerLink.id } })).toBe(0);
  });

  it("rejects an owner of a different apartment removing a tenant", async () => {
    const tenantLink = await addTenant(owner, { apartmentId: apartment.id, email: "t@example.com" });
    const otherApartment = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const otherOwner = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: otherApartment.id,
      role: Role.RESIDENT,
      kind: "OWNER",
    });
    await expect(removeResidency(otherOwner, tenantLink.id)).rejects.toThrow(UnauthorizedError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/residencies/tenants.test.ts`
Expected: FAIL — `addTenant` is not exported.

- [ ] **Step 3: Replace `domain/residencies/index.ts`**

(Keep the module's existing behavior; this refactors the shared link logic into `linkResident` and adds `addTenant` and the owner-aware `removeResidency`.)

```ts
import prisma from "@/lib/prisma";
import { requireMembership, residentApartmentIds, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import {
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import { Role, type Prisma, type ResidencyKind } from "@/lib/generated/prisma";
import { canManageApartment, isApartmentOwner, isCommunityManager, MANAGE_ROLES } from "./access";

async function linkResident(
  tx: Prisma.TransactionClient,
  p: {
    actorId: string;
    communityId: string;
    email: string;
    buildingId: string;
    apartmentId: string;
    kind: ResidencyKind;
  },
) {
  const apartment = await tx.apartment.findUnique({
    where: { id: p.apartmentId },
    include: { building: true },
  });
  if (
    !apartment ||
    apartment.buildingId !== p.buildingId ||
    apartment.building.communityId !== p.communityId
  ) {
    throw new TenantMismatchError(
      `Apartment ${p.apartmentId} does not belong to building ${p.buildingId} in community ${p.communityId}`,
    );
  }

  const user =
    (await tx.user.findUnique({ where: { email: p.email } })) ??
    (await tx.user.create({
      data: { email: p.email, clerkUserId: `pending:${p.email}` },
    }));

  const membership = await tx.membership.findUnique({
    where: { userId_communityId: { userId: user.id, communityId: p.communityId } },
  });
  if (!membership) {
    await tx.membership.create({
      data: {
        userId: user.id,
        communityId: p.communityId,
        buildingId: p.buildingId,
        role: Role.RESIDENT,
      },
    });
  }

  const existing = await tx.apartmentResidency.findUnique({
    where: { userId_apartmentId: { userId: user.id, apartmentId: p.apartmentId } },
  });
  if (existing) {
    throw new ValidationError(`User ${p.email} is already linked to apartment ${p.apartmentId}`);
  }

  const residency = await tx.apartmentResidency.create({
    data: {
      userId: user.id,
      apartmentId: p.apartmentId,
      communityId: p.communityId,
      kind: p.kind,
    },
  });

  await writeAuditLog(tx, {
    communityId: p.communityId,
    userId: p.actorId,
    action: "RESIDENCY_ADDED",
    entity: "ApartmentResidency",
    entityId: residency.id,
    metadata: { targetEmail: p.email, apartmentId: p.apartmentId, kind: p.kind },
  });

  return residency;
}

export async function addResidency(
  actor: SessionUser,
  input: {
    communityId: string;
    email: string;
    buildingId: string;
    apartmentId: string;
    kind: ResidencyKind;
  },
) {
  requireMembership(actor, input.communityId, MANAGE_ROLES);
  return prisma.$transaction((tx) => linkResident(tx, { actorId: actor.id, ...input }));
}

export async function addTenant(
  actor: SessionUser,
  input: { apartmentId: string; email: string },
) {
  const apartment = await prisma.apartment.findUnique({
    where: { id: input.apartmentId },
    include: { building: true },
  });
  if (!apartment) throw new NotFoundError(`Apartment ${input.apartmentId} not found`);
  const communityId = apartment.building.communityId;

  if (!canManageApartment(actor, communityId, apartment.id)) {
    throw new UnauthorizedError(
      `User ${actor.id} may not add tenants to apartment ${apartment.id}`,
    );
  }

  return prisma.$transaction((tx) =>
    linkResident(tx, {
      actorId: actor.id,
      communityId,
      email: input.email,
      buildingId: apartment.buildingId,
      apartmentId: apartment.id,
      kind: "TENANT",
    }),
  );
}

export async function removeResidency(actor: SessionUser, residencyId: string) {
  const residency = await prisma.apartmentResidency.findUnique({ where: { id: residencyId } });
  if (!residency) throw new NotFoundError(`Residency ${residencyId} not found`);

  // Admins and managers remove any link; an owner may only remove tenants of their own apartment.
  const allowed =
    isCommunityManager(actor, residency.communityId) ||
    (residency.kind === "TENANT" && isApartmentOwner(actor, residency.apartmentId));
  if (!allowed) {
    throw new UnauthorizedError(`User ${actor.id} may not remove residency ${residencyId}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.apartmentResidency.delete({ where: { id: residencyId } });
    await writeAuditLog(tx, {
      communityId: residency.communityId,
      userId: actor.id,
      action: "RESIDENCY_REMOVED",
      entity: "ApartmentResidency",
      entityId: residencyId,
      metadata: {
        apartmentId: residency.apartmentId,
        userId: residency.userId,
        kind: residency.kind,
      },
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

(`canManageApartment`'s import is used by `addTenant`; remove any import that ends up unused.)

- [ ] **Step 4: Run all residency tests and typecheck**

Run: `npx vitest run domain && npx tsc --noEmit`
Expected: PASS — including the pre-existing `domain/residencies/index.test.ts` (its assertions on `removeResidency` rejections must still hold) and the new tenants tests.

- [ ] **Step 5: Commit**

```bash
git add domain
git commit -m "feat: owners can add and remove their tenants

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Recipient resolution, default and options

**Files:**
- Create: `domain/residencies/recipients.ts`, `domain/residencies/recipients.test.ts`
- Modify: `domain/packages/reminders.ts`, `domain/packages/index.ts`
- Test: `domain/residencies/recipients.test.ts` (create); extend `domain/packages/reminders.test.ts` only if an existing test breaks

**Interfaces:**
- Consumes: `effectiveResidents` (Task 1), `STAFF_ROLES`, `requireMembership`.
- Produces:
  - `resolvePackageRecipients(tx, pkg: { apartmentId: string; recipientUserId: string | null }): Promise<string[]>` — named user wins; else the user ids of `effectiveResidents` of the apartment's links.
  - `createPackage` input gains `allResidents?: boolean`. Rules inside the transaction after the apartment check: a given `recipientUserId` must be linked to that apartment with `receivesPackages` on, else `TenantMismatchError`; with neither a named recipient nor `allResidents`, the recipient becomes the apartment's primary contact if one exists with `receivesPackages` on, else none; `allResidents: true` means no recipient. The resolved recipient is stored in `Package.recipientUserId`.
  - `PackageRecipientOptions = { default: { type: "primary"; userId: string; name: string } | { type: "all" }; options: { userId: string; name: string; kind: ResidencyKind }[] }` and `getPackageRecipientOptions(actor: SessionUser, communityId: string, apartmentId: string): Promise<PackageRecipientOptions>` (staff only; `TenantMismatchError` when the apartment is not in the community). Options are everyone linked with `receivesPackages` on, owners first, then by name.

- [ ] **Step 1: Write the failing tests** (`domain/residencies/recipients.test.ts`)

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import { TenantMismatchError, UnauthorizedError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { createPackage } from "@/domain/packages";
import { getPackageRecipientOptions } from "@/domain/residencies/recipients";

afterEach(async () => {
  await cleanupDatabase();
});

let community: { id: string };
let building: { id: string };
let apartment: { id: string };
let owner: SessionUser;
let tenant: SessionUser;
let receptionist: SessionUser;

const linkOf = (userId: string) => prisma.apartmentResidency.findFirstOrThrow({ where: { userId } });
const register = (extra: { recipientUserId?: string; allResidents?: boolean } = {}) =>
  createPackage(receptionist, {
    communityId: community.id,
    buildingId: building.id,
    apartmentId: apartment.id,
    ...extra,
  });
const notified = async () =>
  (await prisma.notification.findMany({ where: { type: "PACKAGE_RECEIVED" } }))
    .map((n) => n.recipientUserId)
    .sort();

beforeEach(async () => {
  const base = await createCommunityWithBuildingAndApartment();
  community = base.community;
  building = base.building;
  apartment = base.apartment;
  const common = { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, role: Role.RESIDENT };
  owner = await createUserWithMembership({ ...common, kind: "OWNER" });
  tenant = await createUserWithMembership({ ...common, kind: "TENANT" });
  receptionist = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    role: Role.RECEPTIONIST,
  });
});

describe("package recipients", () => {
  it("by default notifies the people who live there: the tenant, not the renting-out owner", async () => {
    const pkg = await register();
    expect(pkg.recipientUserId).toBeNull();
    expect(await notified()).toEqual([tenant.id]);
  });

  it("includes an owner who says they live there too", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { livesHereOverride: true } });
    await register();
    expect(await notified()).toEqual([owner.id, tenant.id].sort());
  });

  it("uses the primary contact as the default and stores them as the recipient", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { isPrimary: true } });
    const pkg = await register();
    expect(pkg.recipientUserId).toBe(owner.id);
    expect(await notified()).toEqual([owner.id]);
  });

  it("ALL residents overrides the primary contact", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { isPrimary: true } });
    const pkg = await register({ allResidents: true });
    expect(pkg.recipientUserId).toBeNull();
    expect(await notified()).toEqual([tenant.id]);
  });

  it("lets reception name a non-living owner, who is then notified", async () => {
    const pkg = await register({ recipientUserId: owner.id });
    expect(pkg.recipientUserId).toBe(owner.id);
    expect(await notified()).toEqual([owner.id]);
  });

  it("never notifies someone who opted out, and rejects naming them", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(tenant.id)).id }, data: { receivesPackages: false } });
    await register();
    expect(await notified()).toEqual([]);
    await expect(register({ recipientUserId: tenant.id })).rejects.toThrow(TenantMismatchError);
  });

  it("ignores a primary contact who opted out", async () => {
    await prisma.apartmentResidency.update({
      where: { id: (await linkOf(tenant.id)).id },
      data: { isPrimary: true, receivesPackages: false },
    });
    const pkg = await register();
    expect(pkg.recipientUserId).toBeNull();
  });

  it("rejects a named recipient from another apartment", async () => {
    const other = await prisma.apartment.create({ data: { buildingId: building.id, number: "202" } });
    const neighbour = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: other.id,
      role: Role.RESIDENT,
    });
    await expect(register({ recipientUserId: neighbour.id })).rejects.toThrow(TenantMismatchError);
  });
});

describe("getPackageRecipientOptions", () => {
  it("defaults to all residents and lists everyone who receives packages, owners first", async () => {
    const result = await getPackageRecipientOptions(receptionist, community.id, apartment.id);
    expect(result.default).toEqual({ type: "all" });
    expect(result.options.map((o) => [o.userId, o.kind])).toEqual([
      [owner.id, "OWNER"],
      [tenant.id, "TENANT"],
    ]);
  });

  it("defaults to the primary contact when one is set", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(tenant.id)).id }, data: { isPrimary: true } });
    const result = await getPackageRecipientOptions(receptionist, community.id, apartment.id);
    expect(result.default).toMatchObject({ type: "primary", userId: tenant.id });
  });

  it("leaves out people who opted out", async () => {
    await prisma.apartmentResidency.update({ where: { id: (await linkOf(owner.id)).id }, data: { receivesPackages: false } });
    const result = await getPackageRecipientOptions(receptionist, community.id, apartment.id);
    expect(result.options.map((o) => o.userId)).toEqual([tenant.id]);
  });

  it("is staff only and tenant-scoped", async () => {
    await expect(getPackageRecipientOptions(owner, community.id, apartment.id)).rejects.toThrow(UnauthorizedError);
    const other = await createCommunityWithBuildingAndApartment();
    await expect(
      getPackageRecipientOptions(receptionist, community.id, other.apartment.id),
    ).rejects.toThrow(TenantMismatchError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/residencies/recipients.test.ts`
Expected: FAIL (module not found, and the create-package rules are not implemented).

- [ ] **Step 3: Implement `domain/residencies/recipients.ts`**

```ts
import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
import { TenantMismatchError } from "@/domain/errors";
import { STAFF_ROLES } from "@/domain/packages/roles";
import type { ResidencyKind } from "@/lib/generated/prisma";

export type PackageRecipientOptions = {
  default: { type: "primary"; userId: string; name: string } | { type: "all" };
  options: { userId: string; name: string; kind: ResidencyKind }[];
};

const displayName = (u: { firstName: string | null; lastName: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;

export async function getPackageRecipientOptions(
  actor: SessionUser,
  communityId: string,
  apartmentId: string,
): Promise<PackageRecipientOptions> {
  requireMembership(actor, communityId, STAFF_ROLES);

  const apartment = await prisma.apartment.findUnique({
    where: { id: apartmentId },
    include: { building: true },
  });
  if (!apartment || apartment.building.communityId !== communityId) {
    throw new TenantMismatchError(`Apartment ${apartmentId} does not belong to community ${communityId}`);
  }

  const links = await prisma.apartmentResidency.findMany({
    where: { apartmentId, receivesPackages: true },
    include: { user: true },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });

  const options = links.map((l) => ({ userId: l.userId, name: displayName(l.user), kind: l.kind }));
  const primary = links.find((l) => l.isPrimary);
  return {
    default: primary
      ? { type: "primary", userId: primary.userId, name: displayName(primary.user) }
      : { type: "all" },
    options,
  };
}
```

- [ ] **Step 4: Update `domain/packages/reminders.ts`**

Add `import { effectiveResidents } from "@/domain/residencies/occupancy";` and replace the body of `resolvePackageRecipients` after the `recipientUserId` early return with:

```ts
  const links = await tx.apartmentResidency.findMany({
    where: { apartmentId: pkg.apartmentId },
    select: { userId: true, kind: true, livesHereOverride: true, receivesPackages: true },
  });
  return effectiveResidents(links).map((l) => l.userId);
```

- [ ] **Step 5: Update `createPackage` in `domain/packages/index.ts`**

Add `allResidents?: boolean;` to the input type. After the apartment validation block and before `tx.package.create`, add:

```ts
    let recipientUserId: string | null = null;
    if (input.recipientUserId) {
      const link = await tx.apartmentResidency.findUnique({
        where: {
          userId_apartmentId: { userId: input.recipientUserId, apartmentId: input.apartmentId },
        },
      });
      if (!link || !link.receivesPackages) {
        throw new TenantMismatchError(
          `User ${input.recipientUserId} cannot receive packages for apartment ${input.apartmentId}`,
        );
      }
      recipientUserId = link.userId;
    } else if (!input.allResidents) {
      const primary = await tx.apartmentResidency.findFirst({
        where: { apartmentId: input.apartmentId, isPrimary: true, receivesPackages: true },
      });
      recipientUserId = primary?.userId ?? null;
    }
```

and in the `tx.package.create` data replace `recipientUserId: input.recipientUserId,` with `recipientUserId,`.

- [ ] **Step 6: Run the suite and fix collateral**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS. If an existing test fails because it names a `recipientUserId` that is not linked to that apartment (the new rule rejects it), change that test to link the user first (create them via `createUserWithMembership({ ..., apartmentId })`); do not weaken the production rule. Report each such change.

- [ ] **Step 7: Commit**

```bash
git add domain
git commit -m "feat: package recipients follow occupancy, primary contact and opt-out

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Recipient select in the Register-package modal

**Files:**
- Modify: `actions/packages.ts`, `components/packages/CreatePackageForm.tsx`, `messages/en.json`, `messages/pl.json`

**Interfaces:**
- Consumes: `getPackageRecipientOptions`, `PackageRecipientOptions` (Task 4); `createPackage` `recipientUserId` / `allResidents`.
- Produces:
  - `getPackageRecipientOptionsAction(communityId: string, apartmentId: string): Promise<{ ok: true; data: PackageRecipientOptions } | { ok: false }>` (signed-in staff only).
  - `createPackageAction` reads the form field `recipient`: empty = default, `ALL` = all residents, otherwise a user id.
  - Message keys under `packages`: `recipient`, `recipientDefaultPrimary` (`{name}`), `recipientDefaultAll`, `recipientAll`, `recipientOwner` (`{name}`), `recipientTenant` (`{name}`); `packages.actions.apartmentMismatch` text updated.

- [ ] **Step 1: Edit `actions/packages.ts`**

Add imports: `import { getPackageRecipientOptions, type PackageRecipientOptions } from "@/domain/residencies/recipients";`. In `createPackageAction`, after `validated` is parsed successfully and before the `try`, compute:

```ts
  const recipient = String(formData.get("recipient") ?? "");
```

and change the `createPackage(actor, validated.data)` call to:

```ts
    await createPackage(actor, {
      ...validated.data,
      recipientUserId: recipient && recipient !== "ALL" ? recipient : undefined,
      allResidents: recipient === "ALL",
    });
```

Append the new action:

```ts
export async function getPackageRecipientOptionsAction(
  communityId: string,
  apartmentId: string,
): Promise<{ ok: true; data: PackageRecipientOptions } | { ok: false }> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false };
  try {
    return { ok: true, data: await getPackageRecipientOptions(actor, communityId, apartmentId) };
  } catch (error) {
    if (!(error instanceof UnauthorizedError || error instanceof TenantMismatchError)) {
      console.error(error);
    }
    return { ok: false };
  }
}
```

- [ ] **Step 2: Edit `components/packages/CreatePackageForm.tsx`**

Import `getPackageRecipientOptionsAction` from `@/actions/packages` and `type PackageRecipientOptions` from `@/domain/residencies/recipients` (type-only). Add state:

```tsx
  const [recipient, setRecipient] = useState("DEFAULT");
  const [recipientOptions, setRecipientOptions] = useState<PackageRecipientOptions | null>(null);
```

Add an effect (below the existing `useEffect(() => { setApartmentId(""); }, [buildingId]);`):

```tsx
  useEffect(() => {
    setRecipient("DEFAULT");
    setRecipientOptions(null);
    if (!apartmentId) return;
    let cancelled = false;
    getPackageRecipientOptionsAction(communityId, apartmentId).then((result) => {
      if (!cancelled && result.ok) setRecipientOptions(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [apartmentId, communityId]);
```

Immediately after the apartment `<div className="space-y-2">…</div>` block (the one containing `<input type="hidden" name="apartmentId" …/>` and its error `Collapse`), insert:

```tsx
            <Collapse show={Boolean(apartmentId)} className="-mx-1 -mt-1 mb-0!">
              <div className="space-y-2 px-1 pt-1 pb-4">
                <Label htmlFor="recipient">{t("recipient")}</Label>
                <Select value={recipient} onValueChange={setRecipient}>
                  <SelectTrigger id="recipient">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">
                      {recipientOptions?.default.type === "primary"
                        ? t("recipientDefaultPrimary", { name: recipientOptions.default.name })
                        : t("recipientDefaultAll")}
                    </SelectItem>
                    <SelectItem value="ALL">{t("recipientAll")}</SelectItem>
                    {recipientOptions?.options.map((o) => (
                      <SelectItem key={o.userId} value={o.userId}>
                        {o.kind === "OWNER"
                          ? t("recipientOwner", { name: o.name })
                          : t("recipientTenant", { name: o.name })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="recipient" value={recipient === "DEFAULT" ? "" : recipient} />
              </div>
            </Collapse>
```

- [ ] **Step 3: Messages**

`messages/en.json`, under `packages`: `"recipient": "Recipient"`, `"recipientDefaultPrimary": "Default: {name}"`, `"recipientDefaultAll": "Default: all residents"`, `"recipientAll": "All residents"`, `"recipientOwner": "{name} (owner)"`, `"recipientTenant": "{name} (tenant)"`; and change `packages.actions.apartmentMismatch` to `"The selected apartment, building or recipient is invalid"`.
`messages/pl.json`, under `packages`: `"recipient": "Odbiorca"`, `"recipientDefaultPrimary": "Domyślnie: {name}"`, `"recipientDefaultAll": "Domyślnie: wszyscy mieszkańcy"`, `"recipientAll": "Wszyscy mieszkańcy"`, `"recipientOwner": "{name} (właściciel)"`, `"recipientTenant": "{name} (najemca)"`; and change `packages.actions.apartmentMismatch` to `"Wybrane mieszkanie, budynek lub odbiorca są nieprawidłowe"`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS. Clerk sign-in is unavailable, so a visual check is optional; report it honestly as skipped if not done.

- [ ] **Step 5: Commit**

```bash
git add actions components messages
git commit -m "feat: recipient select in the register-package modal

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Profile — people, tenants, switches

**Files:**
- Create: `actions/residencies.ts`, `components/profile/ApartmentPeople.tsx`
- Modify: `domain/profile/index.ts`, `domain/profile/index.test.ts`, `actions/memberships.ts`, `app/profile/page.tsx`, `messages/en.json`, `messages/pl.json`

**Interfaces:**
- Consumes: `addTenant`, `removeResidency`, `updateResidencyPrefs`, `setPrimaryContact`, `livesHere`.
- Produces:
  - `getProfile(...).apartments[]` gains `myLink: { id: string; kind: ResidencyKind; receivesPackages: boolean; livesHereOverride: boolean | null; livesHere: boolean } | null` and `people: { residencyId: string; name: string | null; email: string | null; kind: ResidencyKind; isPrimary: boolean; receivesPackages: boolean; livesHere: boolean; isMe: boolean }[]` (owners get `email`; tenants get `email: null`, and `name` is `null` when a person has no first/last name and the viewer is not an owner).
  - `addTenantAction(prev, formData{apartmentId,email})`, `updateResidencyPrefsAction(residencyId: string, prefs: { receivesPackages?: boolean; livesHereOverride?: boolean | null })`, `setPrimaryContactAction(apartmentId: string, residencyId: string | null)`, each returning `{ message: string; success: boolean }`; `removeResidencyAction` (existing) now also revalidates `/profile`.
  - Message namespaces `profile.people.*` and `profile.actions.*` (listed in Step 8).

- [ ] **Step 1: Write the failing tests** (append to `domain/profile/index.test.ts`; it already imports `prisma`, `Role`, `createCommunityWithBuildingAndApartment`, `createUserWithMembership`, `getProfile`)

```ts
describe("getProfile people", () => {
  async function rented() {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const common = { communityId: community.id, buildingId: building.id, apartmentId: apartment.id, role: Role.RESIDENT };
    const owner = await createUserWithMembership({ ...common, kind: "OWNER", email: "owner@example.com" });
    const tenant = await createUserWithMembership({ ...common, kind: "TENANT", email: "tenant@example.com" });
    await prisma.user.update({ where: { id: tenant.id }, data: { firstName: "Tina", lastName: "Tenant" } });
    return { community, apartment, owner, tenant };
  }

  it("gives an owner the full list with emails and the derived lives-here flags", async () => {
    const { community, apartment, owner } = await rented();

    const profile = await getProfile(owner, community.id);

    const card = profile.apartments.find((a) => a.id === apartment.id)!;
    expect(card.myLink).toMatchObject({ kind: "OWNER", livesHere: false, livesHereOverride: null, receivesPackages: true });
    expect(card.people.map((p) => [p.kind, p.email, p.livesHere, p.isMe])).toEqual([
      ["OWNER", "owner@example.com", false, true],
      ["TENANT", "tenant@example.com", true, false],
    ]);
  });

  it("gives a tenant names and kinds only, with no emails", async () => {
    const { community, apartment, tenant } = await rented();

    const profile = await getProfile(tenant, community.id);

    const card = profile.apartments.find((a) => a.id === apartment.id)!;
    expect(card.myLink).toMatchObject({ kind: "TENANT", livesHere: true });
    expect(card.people.every((p) => p.email === null)).toBe(true);
    expect(card.people.find((p) => p.isMe)?.name).toBe("Tina Tenant");
    expect(card.people.find((p) => !p.isMe)?.name).toBeNull();
  });

  it("marks the primary contact", async () => {
    const { community, apartment, owner, tenant } = await rented();
    await prisma.apartmentResidency.updateMany({ where: { userId: tenant.id }, data: { isPrimary: true } });

    const card = (await getProfile(owner, community.id)).apartments.find((a) => a.id === apartment.id)!;

    expect(card.people.filter((p) => p.isPrimary).map((p) => p.kind)).toEqual(["TENANT"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/profile`
Expected: FAIL (`card.people` is undefined).

- [ ] **Step 3: Implement the `getProfile` changes** (`domain/profile/index.ts`)

Add `import { livesHere } from "@/domain/residencies/occupancy";`. After the `Promise.all`, add:

```ts
  const apartmentIds = apartments.map((a) => a.id);
  const links = apartmentIds.length
    ? await prisma.apartmentResidency.findMany({
        where: { apartmentId: { in: apartmentIds } },
        include: { user: true },
        orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
      })
    : [];
```

Replace the `apartments: apartments.map(...)` entry of the returned object with:

```ts
    apartments: apartments.map((a) => {
      const aptLinks = links.filter((l) => l.apartmentId === a.id);
      const hasTenant = aptLinks.some((l) => l.kind === "TENANT");
      const mine = aptLinks.find((l) => l.userId === actor.id);
      const iAmOwner = mine?.kind === "OWNER";
      return {
        id: a.id,
        number: a.number,
        floor: a.floor,
        building: { name: a.building.name, address: a.building.address },
        myLink: mine
          ? {
              id: mine.id,
              kind: mine.kind,
              receivesPackages: mine.receivesPackages,
              livesHereOverride: mine.livesHereOverride,
              livesHere: livesHere(mine, hasTenant),
            }
          : null,
        people: aptLinks.map((l) => {
          const fullName = [l.user.firstName, l.user.lastName].filter(Boolean).join(" ");
          return {
            residencyId: l.id,
            // Owners see everyone's email; tenants only see names (null when unnamed).
            name: fullName || (iAmOwner ? l.user.email : null),
            email: iAmOwner ? l.user.email : null,
            kind: l.kind,
            isPrimary: l.isPrimary,
            receivesPackages: l.receivesPackages,
            livesHere: livesHere(l, hasTenant),
            isMe: l.userId === actor.id,
          };
        }),
      };
    }),
```

Run: `npx vitest run domain/profile` — expected PASS. (The earlier profile tests keep passing; they assert `apartments[].{id,number,floor,building}` through `toEqual` on whole objects in two places — if either now fails because the object gained `myLink`/`people`, change those assertions to `expect.objectContaining` / `.map(...)` on the fields they care about and report it.)

- [ ] **Step 4: Create `actions/residencies.ts`**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import {
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import { addTenant } from "@/domain/residencies";
import { setPrimaryContact, updateResidencyPrefs } from "@/domain/residencies/prefs";

type ActionState = { message: string; success: boolean };

const addTenantSchema = z.object({
  apartmentId: z.string().min(1),
  email: z.string().trim().email(),
});

export async function addTenantAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("profile.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const validated = addTenantSchema.safeParse({
    apartmentId: formData.get("apartmentId"),
    email: formData.get("email"),
  });
  if (!validated.success) return { message: t("invalidEmail"), success: false };

  try {
    await addTenant(actor, validated.data);
    revalidatePath("/profile");
    return { message: t("tenantAdded"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof ValidationError) return { message: t("alreadyLinked"), success: false };
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    console.error(error);
    return { message: t("tenantFailed"), success: false };
  }
}

export async function updateResidencyPrefsAction(
  residencyId: string,
  prefs: { receivesPackages?: boolean; livesHereOverride?: boolean | null },
): Promise<ActionState> {
  const t = await getTranslations("profile.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await updateResidencyPrefs(actor, residencyId, prefs);
    revalidatePath("/profile");
    return { message: t("prefsSaved"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    if (!(error instanceof ValidationError)) console.error(error);
    return { message: t("prefsFailed"), success: false };
  }
}

export async function setPrimaryContactAction(
  apartmentId: string,
  residencyId: string | null,
): Promise<ActionState> {
  const t = await getTranslations("profile.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await setPrimaryContact(actor, apartmentId, residencyId);
    revalidatePath("/profile");
    return { message: t("primarySet"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    if (error instanceof TenantMismatchError || error instanceof ValidationError) {
      return { message: t("primaryInvalid"), success: false };
    }
    console.error(error);
    return { message: t("primaryFailed"), success: false };
  }
}
```

In `actions/memberships.ts`, change `removeResidencyAction`'s `revalidatePath("/admin");` to also revalidate the profile: replace it with `revalidatePath("/admin");` followed by `revalidatePath("/profile");`.

- [ ] **Step 5: Create `components/profile/ApartmentPeople.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { removeResidencyAction } from "@/actions/memberships";
import {
  addTenantAction,
  setPrimaryContactAction,
  updateResidencyPrefsAction,
} from "@/actions/residencies";

type Kind = "OWNER" | "TENANT";
type ActionState = { message: string; success: boolean };

export type PersonView = {
  residencyId: string;
  name: string | null;
  email: string | null;
  kind: Kind;
  isPrimary: boolean;
  receivesPackages: boolean;
  livesHere: boolean;
  isMe: boolean;
};

export type MyLinkView = {
  id: string;
  kind: Kind;
  receivesPackages: boolean;
  livesHereOverride: boolean | null;
  livesHere: boolean;
};

function report(result: ActionState) {
  if (result.success) toast.success(result.message);
  else toast.error(result.message);
}

export function ApartmentPeople({
  apartmentId,
  myLink,
  people,
}: {
  apartmentId: string;
  myLink: MyLinkView;
  people: PersonView[];
}) {
  const t = useTranslations("profile.people");
  const isOwner = myLink.kind === "OWNER";
  const [busy, setBusy] = useState<string | null>(null);
  const [state, formAction, adding] = useActionState<ActionState, FormData>(addTenantAction, {
    message: "",
    success: false,
  });

  useEffect(() => {
    if (state.message) report(state);
  }, [state]);

  const run = async (key: string, fn: () => Promise<ActionState>) => {
    setBusy(key);
    try {
      report(await fn());
    } finally {
      setBusy(null);
    }
  };

  const hasPrimary = people.some((p) => p.isPrimary);

  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      <h3 className="text-sm font-medium">{t("title")}</h3>

      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.residencyId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              {isOwner && (
                <input
                  type="radio"
                  name={`primary-${apartmentId}`}
                  aria-label={t("makePrimary", { name: p.name ?? t("unnamed") })}
                  checked={p.isPrimary}
                  disabled={busy !== null || !p.receivesPackages}
                  onChange={() => run(`primary-${p.residencyId}`, () => setPrimaryContactAction(apartmentId, p.residencyId))}
                />
              )}
              <span className="font-medium">{p.name ?? t("unnamed")}</span>
              {p.isMe && <span className="text-sm text-muted-foreground">({t("you")})</span>}
              <Badge variant="secondary">{t(`kind.${p.kind}`)}</Badge>
              {p.isPrimary && <Badge>{t("primary")}</Badge>}
              {p.email && p.name !== p.email && (
                <span className="text-sm text-muted-foreground">{p.email}</span>
              )}
            </span>
            {isOwner && p.kind === "TENANT" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeTenant", { name: p.name ?? t("unnamed") })}
                disabled={busy !== null}
                onClick={() => run(`remove-${p.residencyId}`, () => removeResidencyAction(p.residencyId))}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`primary-${apartmentId}`}
            checked={!hasPrimary}
            disabled={busy !== null}
            onChange={() => run("primary-none", () => setPrimaryContactAction(apartmentId, null))}
          />
          {t("noPrimary")}
        </label>
      )}

      {isOwner && (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="apartmentId" value={apartmentId} />
          <div className="space-y-1">
            <Label htmlFor={`tenant-email-${apartmentId}`}>{t("tenantEmail")}</Label>
            <Input id={`tenant-email-${apartmentId}`} name="email" type="email" required className="w-64" />
          </div>
          <Button type="submit" disabled={adding}>
            {t("addTenant")}
          </Button>
        </form>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id={`notify-${apartmentId}`}
            checked={myLink.receivesPackages}
            disabled={busy !== null}
            onCheckedChange={(checked) =>
              run("notify", () => updateResidencyPrefsAction(myLink.id, { receivesPackages: checked }))
            }
          />
          <Label htmlFor={`notify-${apartmentId}`}>{t("notify")}</Label>
        </div>
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <Switch
              id={`lives-${apartmentId}`}
              checked={myLink.livesHere}
              disabled={busy !== null}
              onCheckedChange={(checked) =>
                run("lives", () => updateResidencyPrefsAction(myLink.id, { livesHereOverride: checked }))
              }
            />
            <Label htmlFor={`lives-${apartmentId}`}>{t("livesHere")}</Label>
            {myLink.livesHereOverride === null ? (
              <span className="text-sm text-muted-foreground">{t("livesHereAuto")}</span>
            ) : (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled={busy !== null}
                onClick={() => run("lives", () => updateResidencyPrefsAction(myLink.id, { livesHereOverride: null }))}
              >
                {t("livesHereReset")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire it into `app/profile/page.tsx`**

Import `ApartmentPeople` from `@/components/profile/ApartmentPeople`. Inside each apartment `Card`, after the closing `</dl>` and still inside `<CardContent>`, add:

```tsx
                  {a.myLink && (
                    <ApartmentPeople apartmentId={a.id} myLink={a.myLink} people={a.people} />
                  )}
```

- [ ] **Step 7: Messages**

`messages/en.json` — add under `profile`:

```json
"people": {
  "title": "People",
  "you": "you",
  "unnamed": "Unnamed person",
  "kind": { "OWNER": "Owner", "TENANT": "Tenant" },
  "primary": "Primary contact",
  "makePrimary": "Make {name} the primary contact",
  "noPrimary": "No primary contact",
  "removeTenant": "Remove {name}",
  "tenantEmail": "Tenant's email",
  "addTenant": "Add tenant",
  "notify": "Notify me about packages",
  "livesHere": "I live here",
  "livesHereAuto": "Automatic: you live here while there are no tenants",
  "livesHereReset": "Reset to automatic"
},
"actions": {
  "tenantAdded": "Tenant added",
  "tenantFailed": "Could not add the tenant",
  "noPermission": "You do not have permission for this change",
  "alreadyLinked": "This person is already linked to this apartment",
  "invalidEmail": "Enter a valid email address",
  "notFound": "Not found",
  "prefsSaved": "Saved",
  "prefsFailed": "Could not save the change",
  "primarySet": "Primary contact updated",
  "primaryInvalid": "This person cannot be the primary contact",
  "primaryFailed": "Could not update the primary contact"
}
```

`messages/pl.json` — add under `profile`:

```json
"people": {
  "title": "Osoby",
  "you": "ty",
  "unnamed": "Osoba bez nazwy",
  "kind": { "OWNER": "Właściciel", "TENANT": "Najemca" },
  "primary": "Osoba kontaktowa",
  "makePrimary": "Ustaw {name} jako osobę kontaktową",
  "noPrimary": "Brak osoby kontaktowej",
  "removeTenant": "Usuń {name}",
  "tenantEmail": "Email najemcy",
  "addTenant": "Dodaj najemcę",
  "notify": "Powiadamiaj mnie o paczkach",
  "livesHere": "Mieszkam tu",
  "livesHereAuto": "Automatycznie: mieszkasz tu, dopóki nie ma najemców",
  "livesHereReset": "Przywróć automatyczne"
},
"actions": {
  "tenantAdded": "Dodano najemcę",
  "tenantFailed": "Nie udało się dodać najemcy",
  "noPermission": "Nie masz uprawnień do tej zmiany",
  "alreadyLinked": "Ta osoba jest już przypisana do tego mieszkania",
  "invalidEmail": "Podaj poprawny adres email",
  "notFound": "Nie znaleziono",
  "prefsSaved": "Zapisano",
  "prefsFailed": "Nie udało się zapisać zmiany",
  "primarySet": "Zaktualizowano osobę kontaktową",
  "primaryInvalid": "Ta osoba nie może być osobą kontaktową",
  "primaryFailed": "Nie udało się zaktualizować osoby kontaktowej"
}
```

- [ ] **Step 8: Verify**

Run: `npx vitest run domain/profile i18n && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS. Clerk sign-in is unavailable, so a visual check is optional; report it honestly as skipped if not done.

- [ ] **Step 9: Commit**

```bash
git add domain actions components app messages
git commit -m "feat: owners manage tenants, primary contact and preferences on the profile

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Admin UI — owner or tenant

**Files:**
- Modify: `actions/memberships.ts`, `components/admin/CreateMembershipForm.tsx`, `components/admin/MembershipsTable.tsx`, `messages/en.json`, `messages/pl.json`

**Interfaces:**
- Consumes: `addResidency` (with `kind`).
- Produces: the admin add form sends `kind` (`OWNER` | `TENANT`) when the role is Resident; `createMembershipAction` passes it to `addResidency`; chips show the kind. Message keys `admin.kindLabel`, `admin.kind.OWNER`, `admin.kind.TENANT`.

- [ ] **Step 1: Edit `actions/memberships.ts`**

Import `ResidencyKind` from `@/lib/generated/prisma` (next to `Role`). Add to `createMembershipSchema`: `kind: z.nativeEnum(ResidencyKind).default(ResidencyKind.OWNER),` and to the `safeParse` input: `kind: formData.get("kind") || undefined,`. In the `addResidency` call replace `kind: "OWNER"` (and the `ponytail` comment from Task 1) with `kind: validated.data.kind` — destructure it with the other fields: `const { role, buildingId, apartmentId, communityId, email, kind } = validated.data;` and pass `kind`.

- [ ] **Step 2: Edit `components/admin/CreateMembershipForm.tsx`**

Import `ResidencyKind` from `@/lib/generated/prisma`. Add state `const [kind, setKind] = useState<ResidencyKind>(ResidencyKind.OWNER);`. Immediately after the apartment block (the `{role === Role.RESIDENT && (...)}` section), add:

```tsx
            {role === Role.RESIDENT && (
              <div className="space-y-2">
                <Label htmlFor="kind">{t("kindLabel")}</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as ResidencyKind)}>
                  <SelectTrigger id="kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ResidencyKind.OWNER}>{t("kind.OWNER")}</SelectItem>
                    <SelectItem value={ResidencyKind.TENANT}>{t("kind.TENANT")}</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" name="kind" value={kind} />
              </div>
            )}
```

- [ ] **Step 3: Edit `components/admin/MembershipsTable.tsx`**

In the chip, show the kind after the name: change `{name}` inside the chip `<span>` (the text before the remove `<button>`) to `{name} · {t(`kind.${r.kind}`)}`.

- [ ] **Step 4: Messages**

`messages/en.json` under `admin`: `"kindLabel": "Apartment relationship"`, `"kind": { "OWNER": "Owner", "TENANT": "Tenant" }`.
`messages/pl.json` under `admin`: `"kindLabel": "Relacja z mieszkaniem"`, `"kind": { "OWNER": "Właściciel", "TENANT": "Najemca" }`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add actions components messages
git commit -m "feat: choose owner or tenant when linking a resident in admin

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Seed and final verification

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Update `prisma/seed.ts`**

The seed's `apartmentResidency.create` already states `kind: "OWNER"` after Task 1. Make the first resident's apartment rented, to demonstrate the feature: after the existing residency creation block add

```ts
  const tenant = await prisma.user.create({
    data: {
      clerkUserId: "pending:tenant1@quattro.dev",
      email: "tenant1@quattro.dev",
      firstName: "Tenant",
      lastName: "1",
    },
  });
  await prisma.membership.create({
    data: { userId: tenant.id, communityId: community.id, buildingId: buildings[0].id, role: Role.RESIDENT },
  });
  await prisma.apartmentResidency.create({
    data: {
      userId: tenant.id,
      apartmentId: apartmentsByBuilding[0][0].id,
      communityId: community.id,
      kind: "TENANT",
    },
  });
```

(Do not run the seed against any database.)

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all PASS. Do not run `next build` while a dev server is running.

- [ ] **Step 3: Commit**

```bash
git add prisma
git commit -m "chore: seed a tenant

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Manual check against the local database** (`npm run dev`; skip if Clerk sign-in is unavailable and say so)

1. As a manager on `/admin`, link an email as Resident / Owner of an apartment, then link another as Tenant of the same apartment.
2. As the owner, open `/profile`: the apartment card lists both people; "I live here" shows off (automatic); add a tenant by email; set the tenant as primary contact; remove the tenant.
3. As reception, open the Register-package dialog, choose that apartment: the Recipient select shows the default (the primary contact's name or "all residents"), "All residents", and each person with their kind.
4. Register a package with the default and check that the primary contact gets the notification bell entry and the owner (not living there) does not.

Report which of these were run; do not claim them passed unless executed.
