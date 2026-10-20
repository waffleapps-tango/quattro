# Reports (zgłoszenia) — design

## Goal

Residents file reports about their estate. Two kinds live in one model:

- **Public**: defects and ideas about shared space (grounds, cleanliness, playground, common areas). Visible to the whole community.
- **Private**: matters about the resident's own apartment, parking space, storage unit, access, billing, balcony, renovation or move. Visible only to the author and staff.

Reports are not only defects. Private ones include requests for approval (awning, EV charger), notices (renovation, move) and questions (billing). The model must cover all of these.

## Scope

In the MVP: schema, domain logic, tests, server actions, resident UI, staff UI, navigation entry.

Not in the MVP: photos, comments, notifications, "+1" votes, contractor assignment, anonymous complaints, CSV import and admin UI for parking/storage, ownership history, analytics. See "After the MVP".

## Data model

```prisma
enum ReportType       { DEFECT REQUEST NOTICE QUESTION IDEA COMPLAINT }
enum ReportVisibility { PUBLIC PRIVATE }
enum ReportStatus     { NEW IN_PROGRESS RESOLVED APPROVED REJECTED CLOSED }

model ParkingSpace {
  id           String  @id @default(cuid())
  communityId  String
  buildingId   String?   // null = parking shared across the community
  apartmentId  String?   // null = unassigned / public
  number       String
  level        String?
  hasEvCharger Boolean @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([communityId, number])
  @@index([apartmentId])
}

model StorageUnit {
  id          String  @id @default(cuid())
  communityId String
  buildingId  String
  apartmentId String?   // null = free
  number      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([buildingId, number])
  @@index([apartmentId])
}

model Report {
  id             String           @id @default(cuid())
  communityId    String
  buildingId     String?
  apartmentId    String?          // required when visibility = PRIVATE
  parkingSpaceId String?
  storageUnitId  String?
  authorId       String
  category       String           // key into the in-code catalog
  type           ReportType
  visibility     ReportVisibility // derived from category at creation, then stored
  title          String
  description    String
  status         ReportStatus     @default(NEW)
  urgent         Boolean          @default(false)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  resolvedAt     DateTime?
  @@index([communityId, visibility, status])
  @@index([authorId])
}
```

Relations follow the existing `Package` pattern (Community, Building, Apartment, User).

Parking and storage ownership is the current `apartmentId` only. One space belongs to at most one apartment; an apartment may have many. Changes are recorded in `AuditLog`, no separate history table. A space with `apartmentId = null` is shared or free, so public parking needs no schema change later.

## Category catalog

`domain/reports/catalog.ts` holds the categories in code, not in a table. Each entry has:

- `key`, Polish label
- `visibility` (PUBLIC or PRIVATE), fixed per category
- allowed `type` values
- `subject`: none, apartment, parking, or storage (drives which picker the form shows)
- quick suggestions (the items from the source lists), used as chips that prefill the title

Public categories (about 9): technical defects, media and installations, cleanliness, grounds and greenery (including snow removal), parking and garage (shared), playground and recreation, security and access, pests and animals, other.

Private categories (8): my apartment, my parking space, my storage unit, building access and devices, billing and fees, balcony/terrace/exterior, my renovation, move and changes to my unit.

Neighbour noise and nuisance complaints are `COMPLAINT` type and always PRIVATE, even though they concern common areas.

Rule: category says what the report is about; visibility follows from the category. A shared EV charger is a public category; the charger at my own space is the private "my parking space" category. The form asks "my space or shared?" for parking topics.

The user never picks visibility. It is derived from the category and stored on the row, so later catalog edits do not expose old private reports.

## Statuses

Allowed transitions depend on `type`, validated in the domain layer:

| Type | Flow |
|------|------|
| DEFECT, COMPLAINT | NEW → IN_PROGRESS → RESOLVED |
| REQUEST | NEW → APPROVED or REJECTED |
| NOTICE, QUESTION | NEW → CLOSED |
| IDEA | NEW → CLOSED (accepted/declined noted in a later version) |

`resolvedAt` is set when a report reaches RESOLVED, APPROVED, REJECTED or CLOSED. Every status change writes an `AuditLog` entry.

## Access rules

Enforced in `domain/reports`, never only in the UI.

| Role | Sees | Can change status |
|------|------|-------------------|
| RESIDENT | all PUBLIC reports of own community, own PRIVATE reports | none |
| RECEPTIONIST | all reports of own community, PUBLIC and PRIVATE | all except APPROVED/REJECTED |
| MANAGER, ADMIN | all reports of own community | all |

Every query is scoped by `communityId` taken from the caller's membership. A resident may attach only a parking space or storage unit assigned to their own apartment.

## Domain API

`domain/reports/index.ts`, same style as `domain/packages`:

- `createReport(actor, input)`: validates category/type/subject against the catalog, derives visibility, checks space/unit ownership, writes `AuditLog`.
- `listReports(actor, filters)`: applies the access rules; filters: status, category, urgent, own only.
- `getReport(actor, id)`
- `changeStatus(actor, id, status)`: checks role and the transition table.

Server actions in `actions/reports.ts` wrap these and call `revalidatePath`, matching `actions/packages.ts`.

## UI

Resident:
- "New report": pick category, then suggestion chips, title, description, urgent flag. Private categories with a space or unit subject show a picker limited to the resident's assigned items (auto-selected when there is one).
- "My reports": own reports, both visibilities, with status.
- "Estate board": public reports of the community.

Staff (receptionist, manager, admin):
- One list of all community reports, filters by status, category, urgent, visibility.
- Detail view with status actions; approve/reject only for MANAGER/ADMIN.

A "Reports" entry in desktop and mobile navigation. Components follow the existing `components/packages` layout and the shadcn `components/ui` primitives.

## Data entry for parking and storage

MVP: a seed script assigns spaces and units to apartments. CSV import and ad hoc editing in the admin panel come later; the schema already supports both.

## Testing

Vitest, following `domain/packages`:
- visibility derivation and persistence
- invalid category/type/subject combinations rejected
- status transition table per type
- role rules for viewing and changing status, including RECEPTIONIST seeing private reports and being barred from approve/reject
- resident cannot attach someone else's space or unit
- tenant isolation across communities (model: `tenant-isolation.test.ts`)

## After the MVP

Soon: photos (needs file storage), comments between resident and staff, e-mail notifications on new reports and status changes.

Later: CSV import and admin UI for parking and storage; "+1" and duplicate detection on the public board; contractor assignment, deadlines, SLA; anonymous neighbour complaints; ownership history; public and free parking in the UI; lift booking for moves (separate feature); manager statistics.

## Assumptions to confirm

- RECEPTIONIST may change status except approve/reject (not discussed explicitly).
- IDEA reports close without a distinct accepted/declined outcome in the MVP.
