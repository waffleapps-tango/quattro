# Multi-apartment residency — Design

Sub-project A of a two-part change. Sub-project B (owner and tenant features) gets its own spec and builds on this one.

## Goal

A person can live in, or be linked to, more than one apartment in the same community, and the whole app (packages, reports, notifications, profile, home, admin) works with all of them. Behavior for users with one apartment does not change.

## Decisions

- **Scope split:** A is the multi-apartment foundation; B is owner and tenant features (owner self-service, tenants, read-only owner view, opt-out, primary contact, the recipient select in the Register-package modal).
- **No global apartment switcher.** Pages show everything the user can access across their apartments. Forms that need a single apartment get an explicit select, shown only when the user has more than one.
- **Data model:** a new link table, `ApartmentResidency`; `Membership` stays community-level.
- **Admin UI:** A includes a minimal manager UI to add and remove apartment links. Owner self-service is B.
- Performance is not a concern: a user has a handful of apartments and queries become `apartmentId IN (...)` over existing indexes.

## Data model

New table `ApartmentResidency`:
- `id`, `userId`, `apartmentId`, `communityId` (denormalized from apartment → building so queries filter by tenant directly), `createdAt`.
- `@@unique([userId, apartmentId])`, indexes on `userId` and `apartmentId`.
- No kind or flags yet. B adds `kind` (owner or tenant), `receivesPackages` and `isPrimary` as columns with defaults, which is a non-breaking migration.

`Membership` is unchanged and stays unique per user and community with its role.
- `Membership.apartmentId` becomes deprecated. The column stays and its existing values are left in place (A stays reversible). Application code stops reading it and never writes it. A schema comment says so. Dropping it is a later cleanup.
- `Membership.buildingId` is unchanged; reports still use it.

Invariant: a residency only exists for a user who has a membership in the apartment's community. Adding a residency for a user without one creates a `RESIDENT` membership in the same transaction. Removing a user's last residency does not remove the membership.

Backfill, in the migration SQL: every membership with a non-null `apartmentId` becomes a residency (any role), using `ON CONFLICT DO NOTHING`, with `communityId` taken from the membership. `prisma/seed.ts` is updated to create residencies.

## Read paths

Session:
- `SessionUser` becomes `User & { memberships: Membership[]; residencies: ApartmentResidency[] }`. `getCurrentUser` and `linkClerkUser` load residencies alongside memberships.
- Helper `residentApartmentIds(user, communityId): string[]` in `auth/session.ts`.

Call sites:
- **Packages** (`listPackagesForViewer`): a resident sees packages where they are the named recipient or the package's apartment is in their list. Staff are unchanged.
- **Package notifications** (`resolvePackageRecipients`): "everyone in the apartment" reads `ApartmentResidency` for that apartment instead of `RESIDENT` memberships with that `apartmentId`.
- **Reports** (`domain/reports/index.ts`):
  - A private report requires an explicit `apartmentId` that is one of the user's apartments; the building is derived from it.
  - `canFilePrivate` means at least one residency.
  - `listOwnedSpaces` returns spaces in any of the user's apartments. `CreateReportForm` gets an apartment select only when the user has more than one, which narrows the parking and storage lists.
- **Profile and home page:** `getProfile` returns a list of apartments; both pages render one card per apartment.
- **Admin:** see below.

Unchanged: `memberships[0]` still selects the community (several communities per user stays an existing limitation), `/api/me`, the notification bell and `requireMembership`.

## Domain: `domain/residencies/index.ts`

- `addResidency(actor, { communityId, email, buildingId, apartmentId })`:
  - ADMIN or MANAGER of that community only.
  - Validates the apartment belongs to the building and community (`TenantMismatchError`).
  - Finds or creates the user by email (as `createMembership` does), creates a `RESIDENT` membership if none exists (an existing membership and its role are untouched), creates the residency (duplicate → `ValidationError`), and writes audit `RESIDENCY_ADDED`.
- `removeResidency(actor, residencyId)`: same permission check; deletes and writes audit `RESIDENCY_REMOVED`.
- `removeMembership` also deletes that user's residencies in the community.
- `listMembershipsForCommunity` also loads each user's residencies in that community, with building and apartment.
- `AuditAction` gains `RESIDENCY_ADDED` and `RESIDENCY_REMOVED`.

## `/admin` UI

- One add form. For role `RESIDENT` the building and apartment selects are required and the action calls `addResidency`; for other roles it calls `createMembership` with the building only. Entering an existing person's email with a different apartment adds a second residency.
- The memberships table's Apartment column shows one chip per apartment ("Building / 101") with a remove button, next to the existing role select and remove-membership action.
- New strings in both `messages/pl.json` and `messages/en.json`.

## Testing

Vitest with the existing fixtures. `createUserWithMembership({ apartmentId })` keeps its signature but creates a residency instead of writing `Membership.apartmentId`, so existing tests stay valid; the returned `SessionUser` includes `residencies`.
- `addResidency`: creates user, membership and residency; reuses an existing membership; supports a second apartment for the same person; rejects a duplicate; rejects a manager of another community (`UnauthorizedError`/`TenantMismatchError`); rejects residents and receptionists.
- `removeResidency` and the `removeMembership` cleanup.
- Packages: a resident of two apartments sees both apartments' packages and not a third apartment's; recipient resolution covers every resident of the apartment.
- Reports: filing a private report for an apartment the user does not live in is rejected; the space lists respect the user's apartments.
- Migration backfill is verified manually on the local database (insert a legacy membership with an `apartmentId`, run the migration, confirm the residency exists). This is a manual check, not an automated test.

## Rollout

Local migration first; the GCP database only after explicit approval. `prisma/seed.ts` is updated. For users with one apartment nothing changes except that the profile and home page render a list.

## Out of scope

Owner and tenant types, owner self-service, the recipient select in the Register-package modal, opt-out and primary-contact flags (all sub-project B); a community switcher or several communities per user; dropping `Membership.apartmentId`.
