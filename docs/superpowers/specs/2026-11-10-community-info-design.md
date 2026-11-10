# Community info page — design

Rarely-changing community information (trash schedule and rules, emergency and intervention phone numbers, administration contacts), split into sections. Everyone in the community reads it. Only ADMIN, MANAGER and RECEPTIONIST edit it.

## Decisions

- Each section is either `CONTACTS` (list of name + phone rows) or `TEXT` (free text, line breaks preserved, no markdown).
- Edit permission is one fixed rule: ADMIN, MANAGER, RECEPTIONIST may add, edit, delete and reorder sections. RESIDENT is read-only. No per-section permissions.
- Editing happens inline on a new `/info` page, in dialogs, only visible to staff. No `/admin` tab.
- Sections are scoped to a community. Content is typed by staff in any language, so it is not translated. Only UI labels go into `messages/`.

## Data (Prisma)

`InfoSection`: `id`, `communityId` (relation to Community, indexed), `title`, `kind` (enum `InfoSectionKind`: `CONTACTS | TEXT`), `body` (String, used by TEXT, empty for CONTACTS), `position` (Int), `createdAt`, `updatedAt`.

`InfoContact`: `id`, `sectionId` (relation, `onDelete: Cascade`, indexed), `name`, `phone`, `note?`, `position` (Int).

## Domain (`domain/info`, same style as `domain/packages`)

- `listSections(user, communityId)`: any member of the community. Sections ordered by `position`, contacts ordered by `position`.
- `createSection`, `updateSection`, `deleteSection`, `moveSection(direction)`: require membership in the community with a role from `INFO_EDIT_ROLES = [ADMIN, MANAGER, RECEPTIONIST]`. Tenant mismatch throws `TenantMismatchError`. Each write adds an AuditLog entry.
- `updateSection` replaces the contact rows of a CONTACTS section in one transaction.
- New sections get `position = max + 1`. `moveSection` swaps positions with the neighbour.
- `INFO_EDIT_ROLES` is exported and reused by the UI to decide whether to show edit controls.

## Actions (`actions/info.ts`)

Server actions with zod validation: title 1-100 chars, body up to 5000 chars, up to 30 contacts per section, name 1-100, phone 1-30 (trimmed, no format check, since "112" and "+48 22 ..." both occur), note up to 200. They return `{ message, success }` like the other actions and call `revalidatePath("/info")`.

## UI

- `app/info/page.tsx` and `app/info/loading.tsx`, plus an "Info" nav item for all users (`MainNavigation`, `MobileNavigation`).
- Components in `components/info/`: `InfoSectionCard` (renders one section, contact phones are `tel:` links), `SectionDialog` (add/edit: title, kind switch, rows editor or textarea), `DeleteSectionButton` (existing alert-dialog), move up/down buttons.
- Staff see "Add section" and per-card Edit, Delete, Move controls. Residents see only the cards. Empty state via the existing `EmptyState`.

## Out of scope

Per-section role permissions, drag-and-drop ordering, markdown, per-building sections, translating content, a seed of default content beyond a few examples in `prisma/seed.ts`.

## Tests (vitest)

Resident cannot create, update, delete or move. Staff of another community cannot write (tenant mismatch). Staff can create and edit, and contact replacement removes old rows. `listSections` returns sections and contacts in position order. `moveSection` swaps neighbours and is a no-op at the ends.
