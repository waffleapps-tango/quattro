# Foundation: Tenant Model + Auth + Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace quattro's mock packages/admin pages and single-`Post` schema with a real multi-tenant Community/Building/Apartment/Membership model, Clerk-as-identity-only authorization, and a working reception/resident package flow, backed by Postgres.

**Architecture:** Next.js App Router stays, no separate backend. A new `domain/` layer holds business logic (communities, memberships, packages, audit) and is the only thing that touches Prisma for these features; `auth/session.ts` resolves the Clerk-authenticated request into our own `User` + `Membership` rows; existing `actions/*` Server Action pattern (zod validate → call domain → map errors to `{success, message}`) is reused for mutations; pages stay Server Components that call `domain/*` directly for reads.

**Tech Stack:** Next.js 15 / React 19 / TypeScript (existing), Prisma 6 (existing, switching datasource to Postgres), Clerk (existing, `@clerk/nextjs` — kept as-is), Zod (existing), Vitest (new, for domain-layer tests), `tsx` (new, to run the seed script), `vite-tsconfig-paths` (new, so Vitest resolves the `@/*` path alias).

## Global Constraints

- Keep Clerk as the auth provider. Clerk supplies identity only (`clerkUserId`); authorization reads our own `User`/`Membership` tables, never `publicMetadata`.
- Every model scoped to a community carries `communityId` directly (no inferring it through a join).
- Postgres is the datasource from this plan onward — no SQLite-specific code (e.g. use `mode: "insensitive"` for case-insensitive search, which only Postgres/MySQL support in Prisma, not SQLite).
- Domain functions are the only things that write `Package`, `Membership`, or `AuditLog` rows. Server Actions and pages must not call `prisma.package.*` / `prisma.membership.*` / `prisma.auditLog.*` directly.
- Every mutation that changes a `Package` or `Membership` row writes an `AuditLog` entry in the *same* `prisma.$transaction`.
- Out of scope for this plan (do not build): invitation tokens/QR/email, Announcements, Issues, any notification channel, fine-grained permission tables. Mark anything you're tempted to add here as deferred instead.
- `/posts` and `/locations` pages are untouched by this plan.

---

### Task 1: Local Postgres + Prisma datasource switch

**Files:**
- Create: `docker-compose.yml`
- Modify: `prisma/schema.prisma` (datasource block only)
- Modify: `.gitignore`
- Delete (untrack): `prisma/dev.db`
- Modify: `.env` (local only, not committed — instructions given, not a diff)

**Interfaces:**
- Produces: a running Postgres reachable at `postgresql://quattro:quattro@localhost:5432/quattro`, and `prisma/schema.prisma` with `datasource db { provider = "postgresql" ... }`. All later tasks assume this connection works.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: quattro
      POSTGRES_PASSWORD: quattro
      POSTGRES_DB: quattro
    ports:
      - "5432:5432"
    volumes:
      - quattro_postgres_data:/var/lib/postgresql/data

volumes:
  quattro_postgres_data:
```

- [ ] **Step 2: Start Postgres and confirm it's up**

Run: `docker compose up -d postgres`
Expected: container starts; `docker compose ps` shows `postgres` as `running`/`healthy`.

- [ ] **Step 3: Point `.env` at the local Postgres**

Edit `.env` (not committed, already gitignored by the `.env*` rule) and set:

```
DATABASE_URL="postgresql://quattro:quattro@localhost:5432/quattro"
```

- [ ] **Step 4: Switch the Prisma datasource provider**

In `prisma/schema.prisma`, change:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

to:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 5: Reset migration history and create a fresh baseline migration**

The existing `prisma/migrations/` folder (if present) was generated for SQLite and is incompatible with Postgres. Delete it and start a new history against the new database:

Run: `rm -rf prisma/migrations && npx prisma migrate dev --name init_postgres`
Expected: a new `prisma/migrations/<timestamp>_init_postgres/migration.sql` is created, applies cleanly, and ends with `Your database is now in sync with your schema.`

- [ ] **Step 6: Stop tracking the SQLite dev database and ignore it going forward**

Add to `.gitignore`:

```
# sqlite (replaced by local postgres, see docker-compose.yml)
/prisma/dev.db
```

Run: `git rm --cached prisma/dev.db`

- [ ] **Step 7: Verify the app still boots against Postgres**

Run: `npm run dev` (in one terminal), then in another: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/posts`
Expected: `200`. Stop the dev server after confirming.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml prisma/schema.prisma prisma/migrations .gitignore
git rm --cached prisma/dev.db
git commit -m "chore: switch Prisma datasource from SQLite to local Postgres"
```

---

### Task 2: Vitest test runner setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (devDependencies + `test` script)

**Interfaces:**
- Produces: `npm test` runs Vitest once; later tasks' test files (`**/*.test.ts`) are picked up automatically and can `import "@/..."` paths.

- [ ] **Step 1: Install dependencies**

Run: `npm install -D vitest vite-tsconfig-paths tsx`

- [ ] **Step 2: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
```

- [ ] **Step 4: Write a throwaway smoke test and confirm the runner works**

Create `domain/__smoke__.test.ts` temporarily:

```typescript
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 test file, 1 test, passing.

Delete `domain/__smoke__.test.ts` — it was only to prove the runner works; real domain tests land in Task 15.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add Vitest test runner"
```

---

### Task 3: Prisma schema — tenant, membership, package, audit models

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma Client types `User`, `Community`, `Building`, `Apartment`, `Membership`, `Package`, `AuditLog`, and enums `Role` (`RESIDENT`, `RECEPTIONIST`, `MANAGER`, `ADMIN`) and `PackageStatus` (`RECEIVED`, `READY_FOR_PICKUP`, `PICKED_UP`), all importable from `@/lib/generated/prisma`. Every later task's domain/auth/action/UI code is written against these exact names.

- [ ] **Step 1: Append the new models and enums to `prisma/schema.prisma`**

Keep the existing `generator client`, `datasource db`, and `model Post` blocks unchanged. Add:

```prisma
enum Role {
  RESIDENT
  RECEPTIONIST
  MANAGER
  ADMIN
}

enum PackageStatus {
  RECEIVED
  READY_FOR_PICKUP
  PICKED_UP
}

model User {
  id          String   @id @default(cuid())
  clerkUserId String   @unique
  email       String   @unique
  firstName   String?
  lastName    String?
  createdAt   DateTime @default(now())

  memberships       Membership[]
  recipientPackages Package[]    @relation("PackageRecipient")
  receivedPackages  Package[]    @relation("PackageReceivedBy")
  pickedUpPackages  Package[]    @relation("PackagePickedUpBy")
  auditLogs         AuditLog[]
}

model Community {
  id        String   @id @default(cuid())
  name      String
  address   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  buildings   Building[]
  memberships Membership[]
  packages    Package[]
  auditLogs   AuditLog[]
}

model Building {
  id          String   @id @default(cuid())
  communityId String
  name        String
  address     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  community   Community    @relation(fields: [communityId], references: [id])
  apartments  Apartment[]
  memberships Membership[]
  packages    Package[]

  @@index([communityId])
}

model Apartment {
  id         String   @id @default(cuid())
  buildingId String
  number     String
  floor      Int?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  building    Building     @relation(fields: [buildingId], references: [id])
  memberships Membership[]
  packages    Package[]

  @@unique([buildingId, number])
}

model Membership {
  id          String   @id @default(cuid())
  userId      String
  communityId String
  buildingId  String?
  apartmentId String?
  role        Role
  createdAt   DateTime @default(now())

  user      User       @relation(fields: [userId], references: [id])
  community Community  @relation(fields: [communityId], references: [id])
  building  Building?  @relation(fields: [buildingId], references: [id])
  apartment Apartment? @relation(fields: [apartmentId], references: [id])

  @@unique([userId, communityId, apartmentId])
  @@index([communityId])
  @@index([userId])
}

model Package {
  id              String        @id @default(cuid())
  communityId     String
  buildingId      String
  apartmentId     String
  recipientUserId String?

  trackingNumber String?
  courier        String?
  status         PackageStatus @default(RECEIVED)

  receivedAt   DateTime  @default(now())
  receivedById String
  pickedUpAt   DateTime?
  pickedUpById String?

  notes String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  community  Community @relation(fields: [communityId], references: [id])
  building   Building  @relation(fields: [buildingId], references: [id])
  apartment  Apartment @relation(fields: [apartmentId], references: [id])
  recipient  User?     @relation("PackageRecipient", fields: [recipientUserId], references: [id])
  receivedBy User      @relation("PackageReceivedBy", fields: [receivedById], references: [id])
  pickedUpBy User?     @relation("PackagePickedUpBy", fields: [pickedUpById], references: [id])

  @@index([communityId, status])
  @@index([apartmentId])
  @@index([trackingNumber])
}

model AuditLog {
  id          String   @id @default(cuid())
  communityId String
  userId      String?
  action      String
  entity      String
  entityId    String
  metadata    Json?
  createdAt   DateTime @default(now())

  community Community @relation(fields: [communityId], references: [id])
  user      User?     @relation(fields: [userId], references: [id])

  @@index([communityId, createdAt])
  @@index([entity, entityId])
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name add_tenant_membership_package_audit`
Expected: migration SQL generated and applied, ending with `Your database is now in sync with your schema.` Prisma Client regenerates automatically (`lib/generated/prisma` updates).

- [ ] **Step 3: Confirm the generated client exports the new types**

Run: `npx tsc --noEmit -p tsconfig.json` on a scratch check — actually simplest direct check:

Run:
```bash
node -e "const { PrismaClient, Role, PackageStatus } = require('./lib/generated/prisma'); console.log(Role.ADMIN, PackageStatus.RECEIVED);"
```
Expected output: `ADMIN RECEIVED`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Community/Building/Apartment/Membership/Package/AuditLog schema"
```

---

### Task 4: Domain errors + auth session helpers

**Files:**
- Create: `domain/errors.ts`
- Create: `auth/session.ts`
- Test: `auth/session.test.ts`

**Interfaces:**
- Consumes: `prisma` default export from `@/lib/prisma`; `Role`, `User`, `Membership` types from `@/lib/generated/prisma`; `auth` and `currentUser` from `@clerk/nextjs/server`.
- Produces: `UnauthorizedError`, `NotFoundError`, `TenantMismatchError` classes from `@/domain/errors`; `SessionUser` type and `getCurrentUser(): Promise<SessionUser | null>`, `requireMembership(user: SessionUser, communityId: string, allowedRoles: Role[]): Membership` from `@/auth/session`. Every later domain function (Tasks 6–8) is written against this exact `requireMembership` signature.

- [ ] **Step 1: Write `domain/errors.ts`**

```typescript
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class TenantMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantMismatchError";
  }
}
```

- [ ] **Step 2: Write the failing test for `requireMembership`**

Create `auth/session.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { requireMembership, type SessionUser } from "@/auth/session";
import { UnauthorizedError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

function makeUser(memberships: SessionUser["memberships"]): SessionUser {
  return {
    id: "user_1",
    clerkUserId: "clerk_1",
    email: "a@example.com",
    firstName: null,
    lastName: null,
    createdAt: new Date(),
    memberships,
  };
}

describe("requireMembership", () => {
  it("returns the matching membership when the role is allowed", () => {
    const membership = {
      id: "m1",
      userId: "user_1",
      communityId: "community_1",
      buildingId: null,
      apartmentId: null,
      role: Role.ADMIN,
      createdAt: new Date(),
    };
    const user = makeUser([membership]);

    expect(requireMembership(user, "community_1", [Role.ADMIN])).toBe(membership);
  });

  it("throws UnauthorizedError when the user has no membership in that community", () => {
    const user = makeUser([]);

    expect(() => requireMembership(user, "community_1", [Role.ADMIN])).toThrow(
      UnauthorizedError,
    );
  });

  it("throws UnauthorizedError when the role doesn't match", () => {
    const membership = {
      id: "m1",
      userId: "user_1",
      communityId: "community_1",
      buildingId: null,
      apartmentId: null,
      role: Role.RESIDENT,
      createdAt: new Date(),
    };
    const user = makeUser([membership]);

    expect(() =>
      requireMembership(user, "community_1", [Role.ADMIN, Role.MANAGER]),
    ).toThrow(UnauthorizedError);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- auth/session.test.ts`
Expected: FAIL — `@/auth/session` has no exported member `requireMembership` (module doesn't exist yet).

- [ ] **Step 4: Write `auth/session.ts`**

```typescript
import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { UnauthorizedError } from "@/domain/errors";
import type { Membership, Role, User } from "@/lib/generated/prisma";

export type SessionUser = User & { memberships: Membership[] };

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const existing = await prisma.user.findUnique({
    where: { clerkUserId },
    include: { memberships: true },
  });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  // ponytail: upsert-by-email on first login has a race if the same person
  // logs in twice concurrently before this resolves. Fine for MVP traffic;
  // if it becomes real, move this to a DB-level upsert with a unique
  // constraint conflict handler instead of find-then-branch.
  try {
    return await prisma.user.update({
      where: { email },
      data: { clerkUserId },
      include: { memberships: true },
    });
  } catch {
    return await prisma.user.create({
      data: { clerkUserId, email },
      include: { memberships: true },
    });
  }
}

export function requireMembership(
  user: SessionUser,
  communityId: string,
  allowedRoles: Role[],
): Membership {
  const membership = user.memberships.find(
    (m) => m.communityId === communityId && allowedRoles.includes(m.role),
  );
  if (!membership) {
    throw new UnauthorizedError(
      `User ${user.id} lacks an allowed role in community ${communityId}`,
    );
  }
  return membership;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- auth/session.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add domain/errors.ts auth/session.ts auth/session.test.ts
git commit -m "feat: add domain errors and Clerk-backed session/authorization helpers"
```

---

### Task 5: Domain — audit log writer

**Files:**
- Create: `domain/audit/log.ts`

**Interfaces:**
- Consumes: nothing beyond Prisma's generated `Prisma.TransactionClient` type from `@/lib/generated/prisma`.
- Produces: `writeAuditLog(tx: Prisma.TransactionClient, params: { communityId: string; userId: string | null; action: AuditAction; entity: string; entityId: string; metadata?: Record<string, unknown> }): Promise<void>` from `@/domain/audit/log`, and the exported `AuditAction` union type. Tasks 7 and 8 call this inside their own `prisma.$transaction` blocks.

- [ ] **Step 1: Write `domain/audit/log.ts`**

```typescript
import type { Prisma } from "@/lib/generated/prisma";

export type AuditAction =
  | "PACKAGE_CREATED"
  | "PACKAGE_PICKED_UP"
  | "MEMBERSHIP_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_REMOVED";

export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  params: {
    communityId: string;
    userId: string | null;
    action: AuditAction;
    entity: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      communityId: params.communityId,
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      metadata: params.metadata ?? {},
    },
  });
}
```

This is exercised indirectly by Task 8's and Task 15's tests (`PACKAGE_PICKED_UP` audit entry); no standalone test file needed since it's a 10-line pass-through with no branching logic.

- [ ] **Step 2: Commit**

```bash
git add domain/audit/log.ts
git commit -m "feat: add audit log writer"
```

---

### Task 6: Domain — community queries

**Files:**
- Create: `domain/communities/queries.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`.
- Produces: `listBuildingsForCommunity(communityId: string): Promise<Building[]>` and `listApartmentsForBuilding(buildingId: string): Promise<Apartment[]>` from `@/domain/communities/queries`. Used by the package-creation UI (Task 12) and admin UI (Task 13) to populate building/apartment pickers.

- [ ] **Step 1: Write `domain/communities/queries.ts`**

```typescript
import prisma from "@/lib/prisma";

export function listBuildingsForCommunity(communityId: string) {
  return prisma.building.findMany({
    where: { communityId },
    orderBy: { name: "asc" },
  });
}

export function listApartmentsForBuilding(buildingId: string) {
  return prisma.apartment.findMany({
    where: { buildingId },
    orderBy: { number: "asc" },
  });
}
```

No authorization check here deliberately — these are plain lookups by id with no sensitive data (building/apartment names and numbers), always called from within an already-authorized flow (Tasks 12/13 resolve `communityId`/`buildingId` from the caller's own Membership before calling these). Not building a separate test for two one-line Prisma pass-throughs; they're covered end-to-end by Task 15's tests exercising the package/membership flows that call them.

- [ ] **Step 2: Commit**

```bash
git add domain/communities/queries.ts
git commit -m "feat: add community building/apartment list queries"
```

---

### Task 7: Domain — memberships

**Files:**
- Create: `domain/memberships/index.ts`
- Test: `domain/memberships/index.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; `SessionUser`, `requireMembership` from `@/auth/session`; `writeAuditLog` from `@/domain/audit/log`; `NotFoundError` from `@/domain/errors`; `Role` from `@/lib/generated/prisma`.
- Produces: `listMembershipsForCommunity(actor, communityId)`, `createMembership(actor, input)`, `updateMembershipRole(actor, membershipId, newRole)`, `removeMembership(actor, membershipId)` from `@/domain/memberships`. Used by Task 11's Server Actions and Task 13's admin UI.

This task needs a real Postgres connection (it's a transaction-level integration test, not a pure-function test like Task 4's). Before writing the test, add a tiny shared test helper both this task and Task 8/15 reuse:

- [ ] **Step 1: Write the shared test DB helper**

Create `domain/__test-helpers__/fixtures.ts`:

```typescript
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";

export async function createCommunityWithBuildingAndApartment() {
  const community = await prisma.community.create({
    data: { name: `Test Community ${Date.now()}` },
  });
  const building = await prisma.building.create({
    data: { communityId: community.id, name: "Building A" },
  });
  const apartment = await prisma.apartment.create({
    data: { buildingId: building.id, number: "101" },
  });
  return { community, building, apartment };
}

export async function createUserWithMembership(params: {
  communityId: string;
  buildingId?: string;
  apartmentId?: string;
  role: Role;
  email?: string;
}): Promise<SessionUser> {
  const email = params.email ?? `user-${Date.now()}-${Math.random()}@example.com`;
  const user = await prisma.user.create({
    data: { clerkUserId: `clerk_${email}`, email },
  });
  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      communityId: params.communityId,
      buildingId: params.buildingId,
      apartmentId: params.apartmentId,
      role: params.role,
    },
  });
  return { ...user, memberships: [membership] };
}

export async function cleanupDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.package.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.apartment.deleteMany();
  await prisma.building.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 2: Write the failing tests for the membership domain functions**

Create `domain/memberships/index.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
} from "@/domain/__test-helpers__/fixtures";
import {
  createMembership,
  listMembershipsForCommunity,
  updateMembershipRole,
  removeMembership,
} from "@/domain/memberships";

afterEach(async () => {
  await cleanupDatabase();
});

describe("createMembership", () => {
  it("creates a membership and an audit log entry when the actor is an admin", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({
      communityId: community.id,
      role: Role.ADMIN,
    });

    const membership = await createMembership(admin, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
      email: "resident@example.com",
    });

    expect(membership.role).toBe(Role.RESIDENT);

    const auditEntries = await prisma.auditLog.findMany({
      where: { entity: "Membership", entityId: membership.id },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe("MEMBERSHIP_CREATED");
  });

  it("rejects a non-admin, non-manager actor", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const resident = await createUserWithMembership({
      communityId: community.id,
      role: Role.RESIDENT,
    });

    await expect(
      createMembership(resident, {
        communityId: community.id,
        role: Role.RESIDENT,
        email: "someone@example.com",
      }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("listMembershipsForCommunity", () => {
  it("only returns memberships for the requested community", async () => {
    const { community: communityA } = await createCommunityWithBuildingAndApartment();
    const { community: communityB } = await createCommunityWithBuildingAndApartment();
    const adminA = await createUserWithMembership({
      communityId: communityA.id,
      role: Role.ADMIN,
    });
    await createUserWithMembership({ communityId: communityB.id, role: Role.RESIDENT });

    const result = await listMembershipsForCommunity(adminA, communityA.id);

    expect(result).toHaveLength(1);
    expect(result[0].communityId).toBe(communityA.id);
  });
});

describe("updateMembershipRole / removeMembership", () => {
  it("updates the role and writes an audit entry", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({
      communityId: community.id,
      role: Role.ADMIN,
    });
    const target = await createUserWithMembership({
      communityId: community.id,
      role: Role.RESIDENT,
    });

    const updated = await updateMembershipRole(
      admin,
      target.memberships[0].id,
      Role.RECEPTIONIST,
    );

    expect(updated.role).toBe(Role.RECEPTIONIST);
    const audit = await prisma.auditLog.findMany({
      where: { entity: "Membership", entityId: target.memberships[0].id, action: "USER_ROLE_CHANGED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("removes the membership and writes an audit entry", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const admin = await createUserWithMembership({
      communityId: community.id,
      role: Role.ADMIN,
    });
    const target = await createUserWithMembership({
      communityId: community.id,
      role: Role.RESIDENT,
    });

    await removeMembership(admin, target.memberships[0].id);

    const remaining = await prisma.membership.findUnique({
      where: { id: target.memberships[0].id },
    });
    expect(remaining).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- domain/memberships/index.test.ts`
Expected: FAIL — `@/domain/memberships` module doesn't exist yet.

- [ ] **Step 4: Write `domain/memberships/index.ts`**

```typescript
import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

export async function listMembershipsForCommunity(
  actor: SessionUser,
  communityId: string,
) {
  requireMembership(actor, communityId, [Role.ADMIN, Role.MANAGER]);

  return prisma.membership.findMany({
    where: { communityId },
    include: { user: true, building: true, apartment: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMembership(
  actor: SessionUser,
  input: {
    communityId: string;
    email: string;
    buildingId?: string;
    apartmentId?: string;
    role: Role;
  },
) {
  requireMembership(actor, input.communityId, [Role.ADMIN, Role.MANAGER]);

  return prisma.$transaction(async (tx) => {
    const user =
      (await tx.user.findUnique({ where: { email: input.email } })) ??
      (await tx.user.create({
        data: { email: input.email, clerkUserId: `pending:${input.email}` },
      }));

    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        communityId: input.communityId,
        buildingId: input.buildingId,
        apartmentId: input.apartmentId,
        role: input.role,
      },
    });

    await writeAuditLog(tx, {
      communityId: input.communityId,
      userId: actor.id,
      action: "MEMBERSHIP_CREATED",
      entity: "Membership",
      entityId: membership.id,
      metadata: { targetEmail: input.email, role: input.role },
    });

    return membership;
  });
}

export async function updateMembershipRole(
  actor: SessionUser,
  membershipId: string,
  newRole: Role,
) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
  });
  if (!membership) throw new NotFoundError(`Membership ${membershipId} not found`);

  requireMembership(actor, membership.communityId, [Role.ADMIN, Role.MANAGER]);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: { role: newRole },
    });

    await writeAuditLog(tx, {
      communityId: membership.communityId,
      userId: actor.id,
      action: "USER_ROLE_CHANGED",
      entity: "Membership",
      entityId: membershipId,
      metadata: { from: membership.role, to: newRole },
    });

    return updated;
  });
}

export async function removeMembership(actor: SessionUser, membershipId: string) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
  });
  if (!membership) throw new NotFoundError(`Membership ${membershipId} not found`);

  requireMembership(actor, membership.communityId, [Role.ADMIN, Role.MANAGER]);

  return prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: membershipId } });

    await writeAuditLog(tx, {
      communityId: membership.communityId,
      userId: actor.id,
      action: "USER_REMOVED",
      entity: "Membership",
      entityId: membershipId,
    });
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- domain/memberships/index.test.ts`
Expected: PASS, 5 tests. (Requires the Postgres container from Task 1 running and `DATABASE_URL` set.)

- [ ] **Step 6: Commit**

```bash
git add domain/memberships domain/__test-helpers__
git commit -m "feat: add membership domain functions with audit logging"
```

---

### Task 8: Domain — packages

**Files:**
- Create: `domain/packages/index.ts`
- Test: `domain/packages/index.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; `SessionUser`, `requireMembership` from `@/auth/session`; `writeAuditLog` from `@/domain/audit/log`; `NotFoundError`, `UnauthorizedError` from `@/domain/errors`; `PackageStatus`, `Role`, `Prisma` from `@/lib/generated/prisma`; fixtures from `@/domain/__test-helpers__/fixtures` (Task 7).
- Produces: `createPackage(actor, input)`, `markPickedUp(actor, packageId)`, `listPackagesForViewer(actor, communityId, filters?)` from `@/domain/packages`. Used by Task 10's Server Actions and Task 12's page.

- [ ] **Step 1: Write the failing tests**

Create `domain/packages/index.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError, NotFoundError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
} from "@/domain/__test-helpers__/fixtures";
import { createPackage, markPickedUp, listPackagesForViewer } from "@/domain/packages";

afterEach(async () => {
  await cleanupDatabase();
});

describe("createPackage", () => {
  it("creates a RECEIVED package and an audit entry when actor is staff", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });

    const pkg = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      trackingNumber: "TRK1",
    });

    expect(pkg.status).toBe("RECEIVED");
    expect(pkg.receivedById).toBe(receptionist.id);

    const audit = await prisma.auditLog.findMany({
      where: { entity: "Package", entityId: pkg.id, action: "PACKAGE_CREATED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("rejects a resident trying to register a package", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });

    await expect(
      createPackage(resident, {
        communityId: community.id,
        buildingId: building.id,
        apartmentId: apartment.id,
      }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("markPickedUp", () => {
  it("marks the package picked up and writes an audit entry", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const pkg = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    const updated = await markPickedUp(receptionist, pkg.id);

    expect(updated.status).toBe("PICKED_UP");
    expect(updated.pickedUpById).toBe(receptionist.id);
    expect(updated.pickedUpAt).not.toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: { entity: "Package", entityId: pkg.id, action: "PACKAGE_PICKED_UP" },
    });
    expect(audit).toHaveLength(1);
  });

  it("rejects a resident trying to mark a package picked up", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const pkg = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    await expect(markPickedUp(resident, pkg.id)).rejects.toThrow(UnauthorizedError);
  });

  it("throws NotFoundError for a package that doesn't exist", async () => {
    const { community, building } = await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });

    await expect(markPickedUp(receptionist, "nonexistent-id")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("listPackagesForViewer", () => {
  it("lets staff see every package in their community", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });
    await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    const result = await listPackagesForViewer(receptionist, community.id);
    expect(result).toHaveLength(2);
  });

  it("only lets a resident see their own apartment's packages", async () => {
    const { community, building, apartment } =
      await createCommunityWithBuildingAndApartment();
    const otherApartment = await prisma.apartment.create({
      data: { buildingId: building.id, number: "202" },
    });
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });

    const ownPackage = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });
    await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: otherApartment.id,
    });

    const result = await listPackagesForViewer(resident, community.id);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(ownPackage.id);
  });

  it("never leaks packages across communities", async () => {
    const { community: communityA, building: buildingA, apartment: apartmentA } =
      await createCommunityWithBuildingAndApartment();
    const { community: communityB, building: buildingB, apartment: apartmentB } =
      await createCommunityWithBuildingAndApartment();
    const receptionistA = await createUserWithMembership({
      communityId: communityA.id,
      buildingId: buildingA.id,
      role: Role.RECEPTIONIST,
    });
    const receptionistB = await createUserWithMembership({
      communityId: communityB.id,
      buildingId: buildingB.id,
      role: Role.RECEPTIONIST,
    });
    await createPackage(receptionistA, {
      communityId: communityA.id,
      buildingId: buildingA.id,
      apartmentId: apartmentA.id,
    });
    await createPackage(receptionistB, {
      communityId: communityB.id,
      buildingId: buildingB.id,
      apartmentId: apartmentB.id,
    });

    const resultA = await listPackagesForViewer(receptionistA, communityA.id);
    expect(resultA).toHaveLength(1);
    expect(resultA[0].communityId).toBe(communityA.id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- domain/packages/index.test.ts`
Expected: FAIL — `@/domain/packages` module doesn't exist yet.

- [ ] **Step 3: Write `domain/packages/index.ts`**

```typescript
import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, UnauthorizedError } from "@/domain/errors";
import { PackageStatus, Role, type Prisma } from "@/lib/generated/prisma";

const STAFF_ROLES = [Role.RECEPTIONIST, Role.MANAGER, Role.ADMIN];

export async function createPackage(
  actor: SessionUser,
  input: {
    communityId: string;
    buildingId: string;
    apartmentId: string;
    recipientUserId?: string;
    trackingNumber?: string;
    courier?: string;
    notes?: string;
  },
) {
  requireMembership(actor, input.communityId, STAFF_ROLES);

  return prisma.$transaction(async (tx) => {
    const pkg = await tx.package.create({
      data: {
        communityId: input.communityId,
        buildingId: input.buildingId,
        apartmentId: input.apartmentId,
        recipientUserId: input.recipientUserId,
        trackingNumber: input.trackingNumber,
        courier: input.courier,
        notes: input.notes,
        status: PackageStatus.RECEIVED,
        receivedById: actor.id,
      },
    });

    await writeAuditLog(tx, {
      communityId: input.communityId,
      userId: actor.id,
      action: "PACKAGE_CREATED",
      entity: "Package",
      entityId: pkg.id,
      metadata: { trackingNumber: input.trackingNumber ?? null },
    });

    return pkg;
  });
}

export async function markPickedUp(actor: SessionUser, packageId: string) {
  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg) throw new NotFoundError(`Package ${packageId} not found`);

  requireMembership(actor, pkg.communityId, STAFF_ROLES);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.package.update({
      where: { id: packageId },
      data: {
        status: PackageStatus.PICKED_UP,
        pickedUpAt: new Date(),
        pickedUpById: actor.id,
      },
    });

    await writeAuditLog(tx, {
      communityId: pkg.communityId,
      userId: actor.id,
      action: "PACKAGE_PICKED_UP",
      entity: "Package",
      entityId: pkg.id,
    });

    return updated;
  });
}

export async function listPackagesForViewer(
  actor: SessionUser,
  communityId: string,
  filters: { search?: string } = {},
) {
  const staffMembership = actor.memberships.find(
    (m) => m.communityId === communityId && STAFF_ROLES.includes(m.role),
  );

  const search = filters.search?.trim();
  const searchFilter: Prisma.PackageWhereInput = search
    ? {
        OR: [
          { trackingNumber: { contains: search, mode: "insensitive" } },
          { apartment: { number: { contains: search, mode: "insensitive" } } },
          { recipient: { email: { contains: search, mode: "insensitive" } } },
        ],
      }
    : {};

  if (staffMembership) {
    return prisma.package.findMany({
      where: { communityId, ...searchFilter },
      include: { apartment: true, building: true, recipient: true },
      orderBy: { createdAt: "desc" },
    });
  }

  const residentMembership = actor.memberships.find(
    (m) => m.communityId === communityId,
  );
  if (!residentMembership) {
    throw new UnauthorizedError(
      `User ${actor.id} has no membership in community ${communityId}`,
    );
  }

  const residentFilters: Prisma.PackageWhereInput[] = [
    { recipientUserId: actor.id },
  ];
  if (residentMembership.apartmentId) {
    residentFilters.push({ apartmentId: residentMembership.apartmentId });
  }

  return prisma.package.findMany({
    where: { communityId, OR: residentFilters },
    include: { apartment: true, building: true, recipient: true },
    orderBy: { createdAt: "desc" },
  });
}
```

Note on `residentFilters`: a resident membership with no `apartmentId` (e.g. a community-wide role) only matches packages explicitly addressed to them via `recipientUserId` — it must NOT fall back to matching every package, which is why the apartment branch is only added when `apartmentId` is actually set, rather than passed as `apartmentId: residentMembership.apartmentId ?? undefined` (that would make Prisma ignore the field entirely and return all packages in the community).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- domain/packages/index.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add domain/packages
git commit -m "feat: add package domain functions with tenant-scoped authorization"
```

---

### Task 9: Seed script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `prisma.seed` config and `db:seed`/`db:migrate` scripts)

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`, `Role`/`PackageStatus` from `@/lib/generated/prisma`.
- Produces: `npm run db:seed` populates the dev database per spec §28 (1 Community, 4 Buildings, apartments, 1 Admin/Manager/Receptionist, several Residents, several Packages).

- [ ] **Step 1: Write `prisma/seed.ts`**

```typescript
import prisma from "@/lib/prisma";
import { Role, PackageStatus } from "@/lib/generated/prisma";

async function main() {
  const community = await prisma.community.create({
    data: { name: "Osiedle Kwiatowe", address: "ul. Kwiatowa 1" },
  });

  const buildings = await Promise.all(
    ["A", "B", "C", "D"].map((letter) =>
      prisma.building.create({
        data: { communityId: community.id, name: `Budynek ${letter}` },
      }),
    ),
  );

  const apartmentsByBuilding = await Promise.all(
    buildings.map((building) =>
      Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          prisma.apartment.create({
            data: { buildingId: building.id, number: `${i + 1}`, floor: Math.ceil((i + 1) / 2) },
          }),
        ),
      ),
    ),
  );

  const admin = await prisma.user.create({
    data: { clerkUserId: "pending:admin@quattro.dev", email: "admin@quattro.dev", firstName: "Anna", lastName: "Admin" },
  });
  await prisma.membership.create({
    data: { userId: admin.id, communityId: community.id, role: Role.ADMIN },
  });

  const manager = await prisma.user.create({
    data: { clerkUserId: "pending:manager@quattro.dev", email: "manager@quattro.dev", firstName: "Marek", lastName: "Manager" },
  });
  await prisma.membership.create({
    data: { userId: manager.id, communityId: community.id, role: Role.MANAGER },
  });

  const receptionist = await prisma.user.create({
    data: { clerkUserId: "pending:reception@quattro.dev", email: "reception@quattro.dev", firstName: "Renata", lastName: "Recepcja" },
  });
  await prisma.membership.create({
    data: {
      userId: receptionist.id,
      communityId: community.id,
      buildingId: buildings[0].id,
      role: Role.RECEPTIONIST,
    },
  });

  const residents = await Promise.all(
    [0, 1, 2].map((i) =>
      prisma.user.create({
        data: {
          clerkUserId: `pending:resident${i + 1}@quattro.dev`,
          email: `resident${i + 1}@quattro.dev`,
          firstName: `Resident`,
          lastName: `${i + 1}`,
        },
      }),
    ),
  );

  await Promise.all(
    residents.map((resident, i) =>
      prisma.membership.create({
        data: {
          userId: resident.id,
          communityId: community.id,
          buildingId: buildings[0].id,
          apartmentId: apartmentsByBuilding[0][i].id,
          role: Role.RESIDENT,
        },
      }),
    ),
  );

  await prisma.package.create({
    data: {
      communityId: community.id,
      buildingId: buildings[0].id,
      apartmentId: apartmentsByBuilding[0][0].id,
      recipientUserId: residents[0].id,
      trackingNumber: "TRK1001",
      courier: "DPD",
      status: PackageStatus.RECEIVED,
      receivedById: receptionist.id,
    },
  });

  await prisma.package.create({
    data: {
      communityId: community.id,
      buildingId: buildings[0].id,
      apartmentId: apartmentsByBuilding[0][1].id,
      recipientUserId: residents[1].id,
      trackingNumber: "TRK1002",
      courier: "InPost",
      status: PackageStatus.PICKED_UP,
      receivedById: receptionist.id,
      pickedUpById: receptionist.id,
      pickedUpAt: new Date(),
    },
  });

  console.log(`Seeded community ${community.id} with ${buildings.length} buildings.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Wire up `npm run db:seed` and `npm run db:migrate`**

In `package.json`, add to `"scripts"`:

```json
"db:migrate": "prisma migrate dev",
"db:seed": "tsx prisma/seed.ts",
```

And add a top-level `"prisma"` key (sibling of `"scripts"`, `"dependencies"`, etc.) so `prisma db seed` / `prisma migrate reset` also pick it up:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 3: Run the seed and verify it completes**

Run: `npm run db:seed`
Expected: prints `Seeded community <id> with 4 buildings.` with no errors.

Run: `docker compose exec postgres psql -U quattro -d quattro -c "select count(*) from \"Package\";"`
Expected: `count` is `2`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts package.json package-lock.json
git commit -m "feat: add dev database seed script"
```

---

### Task 10: Server Actions — packages

**Files:**
- Create: `actions/packages.ts`

**Interfaces:**
- Consumes: `getCurrentUser` from `@/auth/session`; `createPackage`, `markPickedUp` from `@/domain/packages`; `UnauthorizedError`, `NotFoundError` from `@/domain/errors`.
- Produces: `createPackageAction(prevState: { message: string; success: boolean }, formData: FormData)` (for `useActionState`, mirroring `actions/actions.ts`'s `createPost`) and `markPickedUpAction(packageId: string): Promise<{ message: string; success: boolean }>` from `@/actions/packages`. Used by Task 12's UI components.

- [ ] **Step 1: Write `actions/packages.ts`**

```typescript
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/session";
import { createPackage, markPickedUp } from "@/domain/packages";
import { UnauthorizedError, NotFoundError } from "@/domain/errors";

const createPackageSchema = z.object({
  communityId: z.string().min(1),
  buildingId: z.string().min(1),
  apartmentId: z.string().min(1),
  trackingNumber: z.string().optional(),
  courier: z.string().optional(),
  notes: z.string().optional(),
});

type ActionState = { message: string; success: boolean };

export async function createPackageAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Not signed in", success: false };

  const validated = createPackageSchema.safeParse({
    communityId: formData.get("communityId"),
    buildingId: formData.get("buildingId"),
    apartmentId: formData.get("apartmentId"),
    trackingNumber: formData.get("trackingNumber") || undefined,
    courier: formData.get("courier") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!validated.success) {
    return { message: "Invalid form data", success: false };
  }

  try {
    await createPackage(actor, validated.data);
    revalidatePath("/packages");
    return { message: "Package registered", success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: "You don't have permission to register packages", success: false };
    }
    console.error(error);
    return { message: "Failed to register package", success: false };
  }
}

export async function markPickedUpAction(packageId: string): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Not signed in", success: false };

  try {
    await markPickedUp(actor, packageId);
    revalidatePath("/packages");
    return { message: "Package marked as picked up", success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: "Package not found", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "You don't have permission to do this", success: false };
    }
    console.error(error);
    return { message: "Failed to update package", success: false };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `actions/packages.ts`.

- [ ] **Step 3: Commit**

```bash
git add actions/packages.ts
git commit -m "feat: add package registration and pickup server actions"
```

---

### Task 11: Server Actions — memberships

**Files:**
- Create: `actions/memberships.ts`

**Interfaces:**
- Consumes: `getCurrentUser` from `@/auth/session`; `createMembership`, `updateMembershipRole`, `removeMembership` from `@/domain/memberships`; `UnauthorizedError`, `NotFoundError` from `@/domain/errors`; `Role` from `@/lib/generated/prisma`.
- Produces: `createMembershipAction(prevState, formData)`, `updateMembershipRoleAction(membershipId: string, newRole: Role): Promise<{message, success}>`, `removeMembershipAction(membershipId: string): Promise<{message, success}>` from `@/actions/memberships`. Used by Task 13's admin UI.

- [ ] **Step 1: Write `actions/memberships.ts`**

```typescript
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/session";
import {
  createMembership,
  updateMembershipRole,
  removeMembership,
} from "@/domain/memberships";
import { UnauthorizedError, NotFoundError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

const createMembershipSchema = z.object({
  communityId: z.string().min(1),
  email: z.string().email(),
  buildingId: z.string().optional(),
  apartmentId: z.string().optional(),
  role: z.nativeEnum(Role),
});

type ActionState = { message: string; success: boolean };

export async function createMembershipAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Not signed in", success: false };

  const validated = createMembershipSchema.safeParse({
    communityId: formData.get("communityId"),
    email: formData.get("email"),
    buildingId: formData.get("buildingId") || undefined,
    apartmentId: formData.get("apartmentId") || undefined,
    role: formData.get("role"),
  });

  if (!validated.success) {
    return { message: "Invalid form data", success: false };
  }

  try {
    await createMembership(actor, validated.data);
    revalidatePath("/admin");
    return { message: "Membership created", success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: "You don't have permission to invite members", success: false };
    }
    console.error(error);
    return { message: "Failed to create membership", success: false };
  }
}

export async function updateMembershipRoleAction(
  membershipId: string,
  newRole: Role,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Not signed in", success: false };

  try {
    await updateMembershipRole(actor, membershipId, newRole);
    revalidatePath("/admin");
    return { message: "Role updated", success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: "Membership not found", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "You don't have permission to change roles", success: false };
    }
    console.error(error);
    return { message: "Failed to update role", success: false };
  }
}

export async function removeMembershipAction(membershipId: string): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Not signed in", success: false };

  try {
    await removeMembership(actor, membershipId);
    revalidatePath("/admin");
    return { message: "Membership removed", success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: "Membership not found", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "You don't have permission to remove members", success: false };
    }
    console.error(error);
    return { message: "Failed to remove membership", success: false };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `actions/memberships.ts`.

- [ ] **Step 3: Commit**

```bash
git add actions/memberships.ts
git commit -m "feat: add membership management server actions"
```

---

### Task 12: Rebuild `/packages` page and components on real data

**Files:**
- Modify: `app/packages/page.tsx`
- Modify: `components/packages/PackagesList.tsx`
- Modify: `components/packages/PackageCard.tsx`
- Create: `components/packages/CreatePackageForm.tsx`
- Modify: `types/package.ts` (delete the mock `Package`/`PackageStatus` types — replaced by Prisma's generated types)

**Interfaces:**
- Consumes: `getCurrentUser` from `@/auth/session`; `listPackagesForViewer` from `@/domain/packages`; `listBuildingsForCommunity`, `listApartmentsForBuilding` from `@/domain/communities/queries`; `createPackageAction`, `markPickedUpAction` from `@/actions/packages`; `Role`, `Package`, `Building`, `Apartment` types from `@/lib/generated/prisma`.
- Produces: a working `/packages` page for both staff and resident roles.

- [ ] **Step 1: Delete the mock package types**

Delete `types/package.ts` — nothing after this task should import `PackageStatus`/`PACKAGE_STATUS_CONFIG` from it; Prisma's generated `Package` and `PackageStatus` replace it.

- [ ] **Step 2: Write `components/packages/CreatePackageForm.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { createPackageAction } from "@/actions/packages";
import type { Building, Apartment } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean };

export function CreatePackageForm({
  communityId,
  buildings,
  apartmentsByBuilding,
}: {
  communityId: string;
  buildings: Building[];
  apartmentsByBuilding: Record<string, Apartment[]>;
}) {
  const [open, setOpen] = useState(false);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPackageAction,
    { message: "", success: false },
  );

  useEffect(() => {
    if (state.success && !pending) setOpen(false);
  }, [state, pending]);

  const apartments = apartmentsByBuilding[buildingId] ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj paczkę
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zarejestruj paczkę</DialogTitle>
          <DialogDescription>
            Wybierz mieszkanie i wpisz dane paczki.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="communityId" value={communityId} />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="buildingId">Budynek</Label>
              <Select
                name="buildingId"
                value={buildingId}
                onValueChange={setBuildingId}
              >
                <SelectTrigger id="buildingId">
                  <SelectValue placeholder="Wybierz budynek" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="buildingId" value={buildingId} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apartmentId">Mieszkanie</Label>
              <Select name="apartmentId">
                <SelectTrigger id="apartmentId">
                  <SelectValue placeholder="Wybierz mieszkanie" />
                </SelectTrigger>
                <SelectContent>
                  {apartments.map((apartment) => (
                    <SelectItem key={apartment.id} value={apartment.id}>
                      {apartment.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trackingNumber">Numer przesyłki</Label>
              <Input id="trackingNumber" name="trackingNumber" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="courier">Kurier</Label>
              <Input id="courier" name="courier" />
            </div>
          </div>
          {state.message && !state.success && (
            <p className="text-sm text-destructive mb-2">{state.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Note: the visible `Select` for `buildingId` is uncontrolled-for-submission (shadcn's `Select` doesn't render a native `<select>`, so it has no form-submittable value by itself) — the adjacent `<input type="hidden" name="buildingId" value={buildingId} />` is what actually gets submitted, kept in sync via `onValueChange`.

- [ ] **Step 3: Rewrite `components/packages/PackageCard.tsx`**

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { markPickedUpAction } from "@/actions/packages";
import type { Package, Apartment, Building, User } from "@/lib/generated/prisma";

type PackageWithRelations = Package & {
  apartment: Apartment;
  building: Building;
  recipient: User | null;
};

const STATUS_LABEL: Record<Package["status"], string> = {
  RECEIVED: "Przyjęta",
  READY_FOR_PICKUP: "Do odbioru",
  PICKED_UP: "Odebrana",
};

export function PackageCard({
  pkg,
  canMarkPickedUp,
}: {
  pkg: PackageWithRelations;
  canMarkPickedUp: boolean;
}) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handlePickup = async () => {
    setIsUpdating(true);
    try {
      const result = await markPickedUpAction(pkg.id);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Skopiowano");
  };

  return (
    <Card className="relative">
      {isUpdating && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>
            {pkg.building.name} / {pkg.apartment.number}
          </span>
          <Badge>{STATUS_LABEL[pkg.status]}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {pkg.trackingNumber && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Numer: {pkg.trackingNumber}
              </p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(pkg.trackingNumber!)}
                className="h-6 w-6"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          {pkg.courier && (
            <p className="text-sm text-muted-foreground">Kurier: {pkg.courier}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Przyjęta: {format(new Date(pkg.receivedAt), "dd.MM.yyyy HH:mm")}
          </p>
          {pkg.recipient && (
            <p className="text-sm text-muted-foreground">
              Odbiorca: {pkg.recipient.email}
            </p>
          )}
          {canMarkPickedUp && pkg.status !== "PICKED_UP" && (
            <Button size="sm" onClick={handlePickup} disabled={isUpdating} className="mt-2">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isUpdating ? "Zapisywanie..." : "Wydaj"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Rewrite `components/packages/PackagesList.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PackageCard } from "./PackageCard";
import { CreatePackageForm } from "./CreatePackageForm";
import { Input } from "@/components/ui/input";
import type { Package, Apartment, Building, User } from "@/lib/generated/prisma";

type PackageWithRelations = Package & {
  apartment: Apartment;
  building: Building;
  recipient: User | null;
};

export function PackagesList({
  packages,
  communityId,
  buildings,
  apartmentsByBuilding,
  isStaff,
}: {
  packages: PackageWithRelations[];
  communityId: string;
  buildings: Building[];
  apartmentsByBuilding: Record<string, Apartment[]>;
  isStaff: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("q", searchValue);
    } else {
      params.delete("q");
    }
    router.push(`/packages?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">Paczki</h2>
          <p className="text-muted-foreground">
            {isStaff ? "Zarządzaj paczkami w recepcji." : "Twoje paczki."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {isStaff && (
            <form onSubmit={handleSearchSubmit}>
              <Input
                placeholder="Szukaj (numer, mieszkanie, email)..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="max-w-sm"
              />
            </form>
          )}
          {isStaff && (
            <CreatePackageForm
              communityId={communityId}
              buildings={buildings}
              apartmentsByBuilding={apartmentsByBuilding}
            />
          )}
        </div>
      </div>

      {packages.length === 0 ? (
        <p className="text-muted-foreground">Brak paczek.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} canMarkPickedUp={isStaff} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `app/packages/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";
import { listPackagesForViewer } from "@/domain/packages";
import { listBuildingsForCommunity, listApartmentsForBuilding } from "@/domain/communities/queries";
import { PackagesList } from "@/components/packages/PackagesList";
import { Role, type Apartment } from "@/lib/generated/prisma";

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: picks the first membership's community. Fine while this
  // deployment serves a single community; a community switcher is needed
  // once a user can belong to more than one.
  const membership = user.memberships[0];
  if (!membership) {
    return (
      <div className="container mx-auto pb-8">
        <h1 className="text-3xl font-bold mb-6">Paczki</h1>
        <p className="text-muted-foreground">
          Nie masz jeszcze dostępu. Poproś administratora o zaproszenie.
        </p>
      </div>
    );
  }

  const { q } = await searchParams;
  const packages = await listPackagesForViewer(user, membership.communityId, { search: q });

  const isStaff = [Role.RECEPTIONIST, Role.MANAGER, Role.ADMIN].includes(membership.role);

  const buildings = isStaff
    ? await listBuildingsForCommunity(membership.communityId)
    : [];

  const apartmentLists = await Promise.all(
    buildings.map((building) => listApartmentsForBuilding(building.id)),
  );
  const apartmentsByBuilding = buildings.reduce<Record<string, Apartment[]>>(
    (acc, building, i) => {
      acc[building.id] = apartmentLists[i];
      return acc;
    },
    {},
  );

  return (
    <div className="container mx-auto pb-8">
      <h1 className="text-3xl font-bold mb-6">Paczki</h1>
      <PackagesList
        packages={packages}
        communityId={membership.communityId}
        buildings={buildings}
        apartmentsByBuilding={apartmentsByBuilding}
        isStaff={isStaff}
      />
    </div>
  );
}
```

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, sign in as the seeded receptionist (`reception@quattro.dev` — note: in dev, signing in requires that email to actually exist as a Google account reachable through your Clerk test instance; if that's impractical locally, sign in with your own Google account and use the admin UI from Task 13 once it exists to grant yourself a RECEPTIONIST membership instead), then:
- Open `/packages`, confirm the seeded packages for building A show up.
- Click "Dodaj paczkę", fill the form, submit, confirm the new package appears and a toast confirms success.
- Click "Wydaj" on a `RECEIVED` package, confirm it flips to "Odebrana" and the button disappears.

Expected: all three steps work with no console errors.

- [ ] **Step 7: Commit**

```bash
git add app/packages/page.tsx components/packages/PackagesList.tsx components/packages/PackageCard.tsx components/packages/CreatePackageForm.tsx
git rm types/package.ts
git commit -m "feat: rebuild packages page on real tenant-scoped data"
```

---

### Task 13: Rebuild `/admin` page — membership management

**Files:**
- Modify: `app/admin/page.tsx`
- Create: `components/admin/MembershipsTable.tsx`
- Create: `components/admin/CreateMembershipForm.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` from `@/auth/session`; `listMembershipsForCommunity` from `@/domain/memberships`; `listBuildingsForCommunity`, `listApartmentsForBuilding` from `@/domain/communities/queries`; `createMembershipAction`, `updateMembershipRoleAction`, `removeMembershipAction` from `@/actions/memberships`; `Role` from `@/lib/generated/prisma`.
- Produces: a working `/admin` page restricted to ADMIN/MANAGER members of the community, replacing the old mock-data + Clerk-`publicMetadata` page.

- [ ] **Step 1: Write `components/admin/CreateMembershipForm.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { createMembershipAction } from "@/actions/memberships";
import { Role, type Building, type Apartment } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean };

export function CreateMembershipForm({
  communityId,
  buildings,
  apartmentsByBuilding,
}: {
  communityId: string;
  buildings: Building[];
  apartmentsByBuilding: Record<string, Apartment[]>;
}) {
  const [open, setOpen] = useState(false);
  const [buildingId, setBuildingId] = useState<string>("");
  const [role, setRole] = useState<Role>(Role.RESIDENT);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createMembershipAction,
    { message: "", success: false },
  );

  useEffect(() => {
    if (state.success && !pending) setOpen(false);
  }, [state, pending]);

  const apartments = buildingId ? apartmentsByBuilding[buildingId] ?? [] : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj członka
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj członka wspólnoty</DialogTitle>
          <DialogDescription>
            Ręczne przypisanie roli (bez zaproszenia e-mail/QR — etap kolejny).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="communityId" value={communityId} />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rola</Label>
              <Select name="role" value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Role.RESIDENT}>Resident</SelectItem>
                  <SelectItem value={Role.RECEPTIONIST}>Receptionist</SelectItem>
                  <SelectItem value={Role.MANAGER}>Manager</SelectItem>
                  <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="role" value={role} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buildingId">Budynek (opcjonalnie)</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger id="buildingId">
                  <SelectValue placeholder="Brak" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="buildingId" value={buildingId} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apartmentId">Mieszkanie (opcjonalnie)</Label>
              <Select name="apartmentId">
                <SelectTrigger id="apartmentId">
                  <SelectValue placeholder="Brak" />
                </SelectTrigger>
                <SelectContent>
                  {apartments.map((apartment) => (
                    <SelectItem key={apartment.id} value={apartment.id}>
                      {apartment.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {state.message && !state.success && (
            <p className="text-sm text-destructive mb-2">{state.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `components/admin/MembershipsTable.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateMembershipRoleAction, removeMembershipAction } from "@/actions/memberships";
import { Role, type Membership, type User, type Building, type Apartment } from "@/lib/generated/prisma";

type MembershipRow = Membership & {
  user: User;
  building: Building | null;
  apartment: Apartment | null;
};

export function MembershipsTable({ memberships }: { memberships: MembershipRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleRoleChange = async (membershipId: string, newRole: Role) => {
    setPendingId(membershipId);
    const result = await updateMembershipRoleAction(membershipId, newRole);
    setPendingId(null);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleRemove = async (membershipId: string) => {
    setPendingId(membershipId);
    const result = await removeMembershipAction(membershipId);
    setPendingId(null);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Budynek</TableHead>
            <TableHead>Mieszkanie</TableHead>
            <TableHead>Rola</TableHead>
            <TableHead>Akcje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {memberships.map((membership) => (
            <TableRow key={membership.id}>
              <TableCell>{membership.user.email}</TableCell>
              <TableCell>{membership.building?.name ?? "—"}</TableCell>
              <TableCell>{membership.apartment?.number ?? "—"}</TableCell>
              <TableCell>
                <Select
                  value={membership.role}
                  onValueChange={(value) => handleRoleChange(membership.id, value as Role)}
                  disabled={pendingId === membership.id}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Role.RESIDENT}>Resident</SelectItem>
                    <SelectItem value={Role.RECEPTIONIST}>Receptionist</SelectItem>
                    <SelectItem value={Role.MANAGER}>Manager</SelectItem>
                    <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId === membership.id}
                  onClick={() => handleRemove(membership.id)}
                >
                  Usuń
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `app/admin/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser, requireMembership } from "@/auth/session";
import { listMembershipsForCommunity } from "@/domain/memberships";
import { listBuildingsForCommunity, listApartmentsForBuilding } from "@/domain/communities/queries";
import { MembershipsTable } from "@/components/admin/MembershipsTable";
import { CreateMembershipForm } from "@/components/admin/CreateMembershipForm";
import { Role, type Apartment } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const membership = user.memberships[0];
  if (!membership) redirect("/");

  try {
    requireMembership(user, membership.communityId, [Role.ADMIN, Role.MANAGER]);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/");
    throw error;
  }

  const memberships = await listMembershipsForCommunity(user, membership.communityId);
  const buildings = await listBuildingsForCommunity(membership.communityId);
  const apartmentLists = await Promise.all(
    buildings.map((building) => listApartmentsForBuilding(building.id)),
  );
  const apartmentsByBuilding = buildings.reduce<Record<string, Apartment[]>>(
    (acc, building, i) => {
      acc[building.id] = apartmentLists[i];
      return acc;
    },
    {},
  );

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Zarządzanie członkami</h1>
        <CreateMembershipForm
          communityId={membership.communityId}
          buildings={buildings}
          apartmentsByBuilding={apartmentsByBuilding}
        />
      </div>
      <MembershipsTable memberships={memberships} />
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in as the seeded admin (or use your own account after bootstrapping it as ADMIN directly in the database: `UPDATE "Membership" SET role = 'ADMIN' WHERE "userId" = (SELECT id FROM "User" WHERE email = 'your-email@example.com');` — only needed once, to get your first admin in without the UI). Visit `/admin`:
- Confirm the seeded memberships list renders with email/building/apartment/role.
- Add a membership via "Dodaj członka", confirm it appears in the table.
- Change a role via the dropdown, confirm the toast confirms and the table reflects it after refresh.
- Remove a membership, confirm it disappears.

Expected: all four steps work with no console errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx components/admin
git commit -m "feat: rebuild admin page as real membership management"
```

---

### Task 14: Role-aware navigation

**Files:**
- Modify: `components/MainNavigation.tsx`
- Create: `app/api/me/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser` from `@/auth/session` (server-side, inside the new route handler).
- Produces: `GET /api/me` returns `{ role: Role | null }` for the caller's first membership; `MainNavigation` gates the "Admin" link on that instead of Clerk's `publicMetadata.role`.

The current `MainNavigation` is a client component reading `user.publicMetadata.role === "admin"` from Clerk — that field is never set anywhere in this codebase (it was a stale assumption from before this plan), and is exactly the thing this plan's auth model replaces. It needs *some* way to learn the caller's role from our own `Membership` table without becoming an async Server Component (it also renders the collapse/expand sidebar state, which needs to stay a client component) — a tiny route handler is the smallest change that provides that, following the same client-fetches-API pattern already used by the old `/admin` page's `useEffect`.

- [ ] **Step 1: Write `app/api/me/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ role: null });

  const role = user.memberships[0]?.role ?? null;
  return NextResponse.json({ role });
}
```

- [ ] **Step 2: Update `components/MainNavigation.tsx`**

Replace the `user.publicMetadata.role === "admin"` check and the dead `/users` link. Change:

```typescript
import { useUser } from "@clerk/nextjs";
```

to:

```typescript
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
```

(merge with the existing `useState` import from `"react"` at the top of the file rather than duplicating it).

Remove the `Users` lucide import and the `{ title: "Users", href: "/users", icon: Users }` entry from `protectedRoutes` — there is no `/users` page in this codebase; membership management now lives at `/admin` (Task 13).

Replace the role-gating logic:

```typescript
const { user } = useUser();
const routes = user 
  ? user.publicMetadata.role === "admin"
    ? [...publicRoutes, ...protectedRoutes, ...adminRoutes]
    : [...publicRoutes, ...protectedRoutes]
  : publicRoutes;
```

with:

```typescript
const { user } = useUser();
const [role, setRole] = useState<string | null>(null);

useEffect(() => {
  if (!user) {
    setRole(null);
    return;
  }
  fetch("/api/me")
    .then((res) => res.json())
    .then((data: { role: string | null }) => setRole(data.role))
    .catch(() => setRole(null));
}, [user]);

const routes = user
  ? role === "ADMIN" || role === "MANAGER"
    ? [...publicRoutes, ...protectedRoutes, ...adminRoutes]
    : [...publicRoutes, ...protectedRoutes]
  : publicRoutes;
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Sign in as a RESIDENT-only seeded user, confirm the "Admin" nav link is absent. Sign in as the ADMIN seed user, confirm it's present and `/admin` loads.

Expected: nav link visibility matches role in both cases.

- [ ] **Step 4: Commit**

```bash
git add components/MainNavigation.tsx app/api/me/route.ts
git commit -m "feat: gate admin nav link on real Membership role instead of Clerk metadata"
```

---

### Task 15: Tenant-isolation and authorization regression tests

**Files:**
- Create: `domain/packages/tenant-isolation.test.ts`

This task exists even though Tasks 7 and 8 already include authorization and cross-community tests inline — this file is the explicit, named checklist from spec §31 so it's easy to find and keep green as a suite on its own, with any gaps not already covered by Tasks 7/8 filled in here.

**Interfaces:**
- Consumes: everything from Task 8's and Task 7's test interfaces (same fixtures module).

- [ ] **Step 1: Write the cross-cutting checklist test**

Create `domain/packages/tenant-isolation.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
} from "@/domain/__test-helpers__/fixtures";
import { createPackage, markPickedUp, listPackagesForViewer } from "@/domain/packages";

afterEach(async () => {
  await cleanupDatabase();
});

describe("spec §31 critical business rules", () => {
  it("a resident cannot see another resident's package", async () => {
    const { community, building } = await createCommunityWithBuildingAndApartment();
    const apartmentA = (await createCommunityWithBuildingAndApartment()).apartment;
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const residentA = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartmentA.id,
      role: Role.RESIDENT,
    });
    const residentB = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RESIDENT,
    });
    await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartmentA.id,
      recipientUserId: residentA.id,
    });

    const visibleToB = await listPackagesForViewer(residentB, community.id);
    expect(visibleToB).toHaveLength(0);
  });

  it("a resident cannot mark a package as picked up", async () => {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const resident = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const pkg = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    await expect(markPickedUp(resident, pkg.id)).rejects.toThrow(UnauthorizedError);
  });

  it("a receptionist can hand over a package", async () => {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const receptionist = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      role: Role.RECEPTIONIST,
    });
    const pkg = await createPackage(receptionist, {
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
    });

    const updated = await markPickedUp(receptionist, pkg.id);
    expect(updated.status).toBe("PICKED_UP");
  });

  it("a user from Community A cannot read Community B's packages", async () => {
    const { community: communityA, building: buildingA, apartment: apartmentA } =
      await createCommunityWithBuildingAndApartment();
    const { community: communityB, building: buildingB, apartment: apartmentB } =
      await createCommunityWithBuildingAndApartment();
    const receptionistB = await createUserWithMembership({
      communityId: communityB.id,
      buildingId: buildingB.id,
      role: Role.RECEPTIONIST,
    });
    const residentA = await createUserWithMembership({
      communityId: communityA.id,
      buildingId: buildingA.id,
      apartmentId: apartmentA.id,
      role: Role.RESIDENT,
    });
    await createPackage(receptionistB, {
      communityId: communityB.id,
      buildingId: buildingB.id,
      apartmentId: apartmentB.id,
    });

    await expect(listPackagesForViewer(residentA, communityB.id)).rejects.toThrow(
      UnauthorizedError,
    );
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: all test files pass, including this new one (4 tests) plus every file from Tasks 4, 7, 8.

- [ ] **Step 3: Commit**

```bash
git add domain/packages/tenant-isolation.test.ts
git commit -m "test: add named regression suite for spec critical business rules"
```

---

### Task 16: Environment variable template and setup docs

**Files:**
- Create: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: a documented, copy-pasteable local setup path for a new developer.

- [ ] **Step 1: Write `.env.example`**

```
# Postgres connection string. Local dev: see docker-compose.yml (docker compose up -d postgres)
DATABASE_URL="postgresql://quattro:quattro@localhost:5432/quattro"

# Clerk — https://dashboard.clerk.com, create an application with Google OAuth enabled
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

- [ ] **Step 2: Replace `README.md`'s content with real setup instructions**

```markdown
# quattro

Community management system for housing communities: resident, receptionist,
manager, and admin roles over a multi-tenant Community → Building →
Apartment hierarchy, with package reception/pickup as the first feature.

## Requirements

- Node.js 20+
- Docker (for local Postgres), or your own Postgres 16 instance
- A Clerk account with Google OAuth enabled (https://dashboard.clerk.com)

## Setup

```bash
npm install
cp .env.example .env
# fill in .env: DATABASE_URL (see docker-compose.yml) and the Clerk keys
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

## Scripts

- `npm run dev` — start the Next.js dev server
- `npm run build` / `npm run start` — production build/serve
- `npm test` — run the Vitest suite (needs the Postgres container running)
- `npm run db:migrate` — apply Prisma migrations
- `npm run db:seed` — seed a dev community, buildings, apartments, users, and packages

## Architecture

See `docs/superpowers/specs/2026-10-06-foundation-tenant-packages-design.md`
for the current design (tenant model, authorization, package flow) and
what's deliberately deferred to later stages (invitations, announcements,
issues).
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add .env.example and real setup instructions"
```

---

## Self-review notes

- **Spec coverage:** every section of the design doc that's in-scope for this stage has a task — datasource (Task 1), schema (Task 3), auth helpers (Task 4), audit (Task 5), community queries (Task 6), memberships (Task 7, 11, 13), packages (Task 8, 10, 12), seed (Task 9), nav role gating (Task 14), tests (Task 15), docs (Task 16). Deferred items (invitation flow, announcements, issues, notifications) are explicitly listed as out of scope in the Global Constraints and the design doc, not silently dropped.
- **Type consistency:** `requireMembership(user, communityId, roles[])` signature from Task 4 is used identically in Tasks 7, 8, and 13. `SessionUser` (Task 4) is the type every domain function in Tasks 7–8 takes as `actor`. `writeAuditLog(tx, params)` (Task 5) is called the same way from Tasks 7 and 8. Action return shape `{ message: string; success: boolean }` (Task 10, 11) matches the existing `createPost` convention in `actions/actions.ts`.
- **Fixed during authoring:** `listPackagesForViewer`'s resident branch originally would have passed `apartmentId: residentMembership.apartmentId ?? undefined` into a Prisma `OR` filter — Prisma treats an `undefined` field as "omit this filter," which would have silently returned every package in the community to a resident with no `apartmentId` set on their membership. Task 8's final code only adds the apartment clause when `apartmentId` is truthy, and Task 15 has a dedicated cross-community test to catch a regression here.
