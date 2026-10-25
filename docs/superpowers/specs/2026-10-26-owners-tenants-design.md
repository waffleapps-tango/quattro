# Owners, tenants and package recipients — Design

Sub-project B. It builds on `2026-10-25-multi-apartment-residency-design.md` (sub-project A, already merged).

## Goal

An apartment can have owners and tenants. An owner can rent the apartment out in the app and manage tenants themselves; tenants get portal access to that apartment. Reception chooses who a package is for when registering it, with a default that needs no extra clicks, and people can opt out of being notified or selected.

## Decisions

- **Who adds whom:** an admin or manager marks someone as owner or tenant (from `/admin`). An owner adds and removes tenants of their own apartments themselves. Admins and managers can do everything an owner can.
- **Owner while the apartment is rented:** the owner keeps portal access and sees all of the apartment's packages read-only, but is notified only when named at reception. They can opt out of being notified and of being selectable.
- **Default recipient at reception:** the apartment's primary contact (set by an owner or an admin or manager). Without one, the default is "All residents".
- **Whether an owner lives there:** derived from tenants (an owner counts as a resident only while the apartment has no tenants), with an override switch for an owner who shares the flat with a tenant.
- **Tenant links have no end date.** The owner or a manager removes the tenant when the lease ends.
- **Where owners manage this:** inside the apartment cards on `/profile`; no new navigation.
- Multiple apartments per person already exist (sub-project A).

## Data model

Columns added to `ApartmentResidency`:
- `kind`: enum `ResidencyKind` (`OWNER`, `TENANT`). The migration adds the column with default `'OWNER'` (so every existing link becomes an owner, including the existing admin's A/4 link), then drops the default so new links must state their kind.
- `livesHereOverride Boolean?`: used for owners only; `null` means derived.
- `receivesPackages Boolean @default(true)`: the opt-out. When false the person is not selectable at reception and is not part of "All residents".
- `isPrimary Boolean @default(false)`: partial unique index on `apartmentId WHERE "isPrimary"` allows at most one primary contact per apartment (added in the migration SQL by hand, since Prisma cannot declare partial indexes).

Effective "lives here":
- A tenant always lives there.
- An owner lives there if `livesHereOverride` is true. If it is null, only while the apartment has no `TENANT` link. If false, never.

Owner powers come from the `OWNER` link, not from `Membership.role`, so a plain `RESIDENT` can be an owner. `Membership` is unchanged.

## Recipient rules

- **All residents** = linked people who effectively live there and have `receivesPackages` on.
- **Select options at reception** = everyone linked to the apartment with `receivesPackages` on (including an owner who does not live there, so they can be named), plus an "All residents" option.
- **Default** = the primary contact if one is set and still receives packages; otherwise "All residents".
- The default is resolved when the package is created. A primary contact is stored as `Package.recipientUserId`; "All residents" leaves it empty, as today.
- Named recipient wins in `resolvePackageRecipients`; otherwise the effective residents with `receivesPackages` on are notified.
- **Visibility is unchanged from sub-project A:** anyone linked to the apartment (owner or tenant, living or not, opted out or not) sees its packages. Residents cannot change packages, so the owner's view is read-only.

## Domain (`domain/residencies`)

- `addResidency` takes a `kind` argument (admin or manager only, as before).
- `addTenant(actor, { apartmentId, email })`: the actor must hold an `OWNER` link on that apartment, or be an admin or manager of its community. Finds or creates the user by email, creates a `RESIDENT` membership if none exists, creates a `TENANT` link, rejects a duplicate, and writes `RESIDENCY_ADDED` with `kind` in the metadata.
- `removeResidency`: an owner may remove `TENANT` links on their own apartments. `OWNER` links can only be removed by an admin or manager.
- `updateResidencyPrefs(actor, residencyId, { receivesPackages?, livesHereOverride? })`: the link's own user, or an admin or manager. `livesHereOverride` is only valid on owner links. Turning `receivesPackages` off clears `isPrimary` on that link. Audit: `RESIDENCY_PREFS_CHANGED`.
- `setPrimaryContact(actor, apartmentId, residencyId | null)`: an owner of the apartment, or an admin or manager. The target must belong to that apartment and have `receivesPackages` on. Clearing the previous primary and setting the new one happen in one transaction. Audit: `PRIMARY_CONTACT_CHANGED`.
- `effectiveResidents(...)` is the single implementation of the "lives here" rule, shared by recipient resolution and the UI.
- `getPackageRecipientOptions(actor, apartmentId)`: staff only; returns the options and which one is the default.
- `resolvePackageRecipients` (domain/packages/reminders.ts) follows the recipient rules above.
- `AuditAction` gains `RESIDENCY_PREFS_CHANGED` and `PRIMARY_CONTACT_CHANGED`.

## Register-package modal

- After the apartment select a **Recipient** select appears, loaded when the apartment is chosen through a staff-only server action. The first, preselected option reads "Default: <primary contact name>" or "Default: All residents"; then "All residents"; then each person as "Name (owner)" or "Name (tenant)".
- The form sends `recipient`: empty for the default, `ALL`, or a user id. `createPackage` turns the default into the primary contact's id (or no recipient) and `ALL` into no recipient. A user id must be linked to that apartment with `receivesPackages` on, otherwise `TenantMismatchError`.
- An apartment with nobody linked shows just the default, and the package is registered as today.

## Profile UI (`/profile`)

- Each apartment card keeps its current content, plus:
  - Owner: a People list (name, kind, primary-contact radio; tenants have a remove button), an "Add tenant" email form, and two switches: "Notify me about packages" and "I live here too" (it shows the derived state until set).
  - Tenant: a read-only list of people (names and kind, no emails) and the "Notify me about packages" switch.
- `getProfile` returns, per apartment, the user's own link (id, kind, `receivesPackages`, `livesHereOverride`) and the people list; owners get full details, tenants a reduced view.
- Server actions: `addTenantAction`, `removeResidencyAction` (existing), `updateResidencyPrefsAction`, `setPrimaryContactAction`, each mapping domain errors to translated messages (pl and en).

## Admin UI

The add form for a Resident gains a kind select (Owner or Tenant, default Owner). Chips in the memberships table show a small "owner" or "tenant" label.

## Migration and rollout

- A new migration adds the columns and the partial unique index and sets existing links to `OWNER`.
- `prisma/seed.ts` creates its residents as owners.
- Local migration first. The GCP database only after explicit approval, using the same read-only consistency check as for sub-project A.

## Testing

Vitest with the existing fixtures:
- Effective "lives here": tenant; owner with no tenants; owner with a tenant; override true and false.
- `addTenant`: allowed for an owner, admin and manager; rejected for a tenant, an owner of a different apartment, and a manager of another community.
- `removeResidency`: an owner removes a tenant but not an owner link.
- `updateResidencyPrefs`: opt-out clears the primary contact; the override is rejected on a tenant link; changing someone else's link is rejected.
- `setPrimaryContact`: only one primary per apartment; the target must receive packages.
- Recipients: default = primary contact, else all effective residents; a non-living owner is not in "All residents" but is selectable and is notified when named; an opted-out person is never selectable or notified; a named user from another apartment is rejected.
- Package visibility is unchanged for owners and tenants.

## Out of scope

Lease start and end dates, owners seeing tenants' private reports, a community switcher or several communities per user, email, SMS and other channels, per-type notification preferences.
