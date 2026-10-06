# Foundation: Tenant Model + Auth + Packages — Design

Date: 2026-10-06
Status: Approved (stage 1 of multi-stage rollout of the community-management spec)

## Context

Quattro is being adjusted from a generic Next.js starter (mock packages page,
static "locations" directory, mock admin user list, single `Post` model) into
the first MVP slice of a multi-tenant housing-community platform (full
requirements: paczki na recepcji, mieszkańcy, role, multi-tenancy).

This is stage 1 of a multi-stage rollout. Out of scope for this stage:
invitation flow (tokens/QR/email), announcements, issues, notifications
abstraction beyond what's needed here. Those are separate future spec cycles.

## Decisions

- **Auth provider: keep Clerk.** Already wired (Google OAuth, middleware,
  hosted sign-in/sign-up pages). Clerk is used strictly as an identity
  mechanism (gives us `clerkUserId`); it is *not* the source of truth for
  authorization. Role/Membership live in our own Postgres tables, keyed by
  `clerkUserId` on `User`. Rejected: migrating to Auth.js/NextAuth — would
  mean reimplementing Account/Session tables and OAuth config for no
  functional gain, since Clerk already satisfies the "Google is only an auth
  mechanism, not an access grant" requirement once we stop reading
  `publicMetadata.role` for authorization (today's `/admin` page does this
  and is being replaced).
- **Database: migrate dev from SQLite to Postgres now.** The schema needs
  native enums (`Role`, `PackageStatus`) and relational constraints that
  SQLite handles poorly. Migrating later would mean a second schema rewrite
  plus data migration. Local dev via Docker Postgres (or Postgres.app).
- **Scope for this stage:** tenant model (Community/Building/Apartment),
  Membership/Role, authorization helpers, and the real Package feature
  (reception + resident flows). Invitation flow is deferred; Membership rows
  are created via seed data and a minimal admin UI (manual creation, no
  token/QR/email) in this stage.
- **Legacy pages:** `/posts` (real Prisma CRUD, future Announcements) and
  `/locations` (static facility directory, unrelated to Building/Apartment
  hierarchy) are left untouched — out of scope. `/admin` is rewritten in this
  stage: replaces the mock user list + Clerk-`publicMetadata`-role approach
  with real Membership management.

## Architecture

No separate backend. Next.js App Router stays as-is. A `domain/` layer is
added so business logic doesn't live directly in Server Actions or
components:

```
domain/
  communities/   (community, building, apartment queries)
  memberships/   (membership CRUD, role checks)
  packages/      (package CRUD, status transitions)
  audit/         (audit log writer)
auth/
  session.ts     (getCurrentUser + membership/role helpers, Clerk-backed)
```

`actions/` (existing Server Actions layer, same pattern as today's
`createPost`/`updatePost`/`deletePost`) calls into `domain/*` instead of
Prisma directly, gaining authorization checks for free.

Clerk supplies only `clerkUserId`. Our own `User` row (unique on
`clerkUserId`) and `Membership` rows (user × community × building? ×
apartment? × role) are the source of truth for "who can do what, where."

## Database schema (Prisma, Postgres)

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

  memberships         Membership[]
  recipientPackages   Package[] @relation("PackageRecipient")
  receivedPackages    Package[] @relation("PackageReceivedBy")
  pickedUpPackages    Package[] @relation("PackagePickedUpBy")
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

  trackingNumber  String?
  courier         String?
  status          PackageStatus @default(RECEIVED)

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

  @@index([communityId, createdAt])
  @@index([entity, entityId])
}

model Post {
  // unchanged
}
```

Tenant isolation: every model that belongs to a community carries
`communityId` directly (no relying on joining through Building/Apartment to
infer it), per spec §19.

## Authorization model

```
auth/session.ts
  getCurrentUser()                         // Clerk auth() → lookup User by clerkUserId; lazily create row on first login if missing (matched/backfilled by email against seeded placeholder rows)
  getMemberships(userId)                   // all Membership rows for the user
  requireMembership(communityId, roles[])  // throws UnauthorizedError if no matching Membership/role; used inside domain/* functions
```

Flow: Clerk middleware still gates "is this request authenticated at all"
(unchanged from today). Tenant/role authorization is a separate layer that
runs inside `domain/*` functions — middleware has no concept of
community/building/apartment scope, so it can't do this check.

Every domain query takes `communityId` (and `buildingId` where relevant)
derived from the *caller's own Membership rows*, never trusted from
unvalidated client input. Example: a receptionist's package list query is
scoped to the buildings where they hold a Membership, not to a client-sent
`buildingId`.

Bootstrap for a user with no Membership yet: they see a "no access, wait for
an invite" screen. (Real invitation flow lands in stage 2; for now an admin
creates their Membership manually in `/admin`.)

## Package flow + UI

- `/packages`: replaces the mock `PackagesList`/`PackageCard` data source
  with real queries through `domain/packages`, scoped to the caller's
  community/building(s).
  - Receptionist/Manager/Admin: full dashboard. Two fast actions per spec
    UX guidance (§26): **Dodaj paczkę** (pick apartment, enter
    tracking/courier/notes → creates `Package` with status `RECEIVED`) and
    **Wydaj** (search package/resident → `markPickedUp`, sets
    `pickedUpById` + `pickedUpAt`, status → `PICKED_UP`).
  - Resident: same route, read-only list filtered to their own packages
    (`recipientUserId = user.id`, or matched by their apartment
    Membership).
- Search (spec §27): Postgres `ILIKE` over `trackingNumber`, apartment
  number, and recipient name — backed by the indexes already in the schema.
  No Elasticsearch needed for this volume.
- Every status change writes an `AuditLog` row (`PACKAGE_CREATED`,
  `PACKAGE_PICKED_UP`) in the same `prisma.$transaction` as the package
  write — never a separate, best-effort call.
- Authorization, not just UI hiding: `markPickedUp` in `domain/packages`
  calls `requireMembership(communityId, [RECEPTIONIST, MANAGER, ADMIN])`
  before touching the row. A resident calling the action directly (bypassing
  the UI) gets `UnauthorizedError`, not a silently-hidden button.

Error handling: domain functions throw typed errors (`UnauthorizedError`,
`NotFoundError`, `TenantMismatchError`). Server Actions catch them and map to
the existing `{ success: false, message }` shape already used by
`createPost`/`updatePost`/`deletePost` — no new response convention
introduced.

## Admin UI (minimal, this stage only)

`/admin` is rewritten (no longer reads `publicMetadata.role` or shows a mock
user list):

- List of Membership rows for the admin's community: user email, building,
  apartment, role.
- Form to add a Membership: pick building/apartment, enter role, enter
  email. If no `User` row exists yet for that email, a placeholder `User`
  row is created (no `clerkUserId` yet); it gets backfilled with the real
  `clerkUserId` the first time that person signs in via Clerk and
  `getCurrentUser()` matches them by email.
- Role change and Membership removal, each writing an `AuditLog` entry
  (`USER_ROLE_CHANGED`, `USER_REMOVED`).
- No token/QR/email in this stage — that's the invitation-flow stage.

## Seed data

`prisma/seed.ts`: 1 Community, 4 Buildings, ~12–16 Apartments, 1 Admin, 1
Manager, 1 Receptionist, a handful of Residents (each with a Membership),
and a few Packages across different statuses. Seeded people get `User` rows
with a placeholder `clerkUserId`, backfilled on first real Clerk login
(matched by email) — same mechanism as the admin-created placeholder rows
above.

## Testing

Vitest, prioritized per spec §31, scoped to what this stage introduces:

- a resident cannot see another resident's package
- a resident cannot mark a package as picked up
- a receptionist can hand over a package (only within their own
  building/community)
- a user from Community A cannot read Community B's data
- marking a package picked up creates the corresponding AuditLog entry

## Explicitly deferred to later stages

- Invitation flow: token generation, hashing, expiry, QR codes, email
  delivery.
- Package pickup via resident-shown QR code.
- Announcements, Issues/Maintenance reporting.
- Notification abstraction (email/push/SMS) beyond what's not needed here
  (no notifications are sent in this stage).
- Permission-table split (fine-grained `packages:create` style
  permissions) — role-based checks are sufficient for this stage.
