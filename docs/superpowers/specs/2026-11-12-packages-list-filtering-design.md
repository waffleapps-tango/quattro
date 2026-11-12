# Packages list: filtering, sorting, pagination, recipient hints

## Goal

Reception can find a resident's packages quickly, the table scales as history grows, and
old picked-up packages stop cluttering the default view. Also make the recipient picker in
the "Zarejestruj paczkę" modal usable when names are hidden by privacy settings.

## Decisions (agreed with user)

- Filtering, sorting and pagination run on the server, driven by URL search params, so views
  are shareable and survive refresh. Extends the existing `?q=` search.
- "Tylko nieodebrane" (status != PICKED_UP) is **on by default**; turning it off shows history.
- Privacy stays as is: residents with `shareName = false` remain masked for staff. We add hints
  instead of revealing names.

## URL params

| param | values | default | who |
|---|---|---|---|
| `q` | text: tracking number, courier, apartment number, recipient email/name | – | all (recipient parts staff only, as today) |
| `building` | building id | all | staff |
| `apartment` | apartment number (text, contains) | – | staff |
| `recipient` | text matched against recipient first/last name and email, only users with `shareName = true` | – | staff |
| `status` | `open` \| `all` | `open` | all |
| `sort` | `received` \| `apartment` \| `status` | `received` | all |
| `dir` | `asc` \| `desc` | `desc` | all |
| `page` | 1-based int | 1 | all |

Page size is a constant of 20. Invalid values fall back to defaults (parsed and clamped in one
place, never trusted).

## Domain

`listPackagesForViewer(actor, communityId, query)` in `domain/packages/index.ts` returns
`{ items, total, page, pageSize }`.

- Builds one `Prisma.PackageWhereInput` from the parsed query; staff and resident branches
  keep their existing access rules (resident filter is ANDed with the status filter, never
  replaced by it).
- Building/apartment/recipient filters are ignored for residents.
- `orderBy` per sort key with a stable tiebreaker (`createdAt desc`, then `id`).
  `apartment` sorts by building name then apartment number; `status` by status then received date.
- Uses `findMany` + `count` with the same `where`, `skip/take`.
- A new pure helper `parsePackageQuery(searchParams)` (own file) does parsing and defaults and
  is unit tested.

## UI

- `app/packages/page.tsx` parses `searchParams`, passes `total`, `page`, `pageSize` down.
- `PackagesList` toolbar: search box (existing), "Tylko nieodebrane" switch, and for staff a
  collapsible filter row with building select, apartment input, recipient input and a reset
  button. Every control updates the URL (`router.push`, resets `page` to 1).
- Table headers "Lokal i odbiorca" (apartment), "Przyjęcie" (received) and "Status" become sort
  buttons with an aria-sort indicator; clicking toggles dir. Package and Actions columns are not
  sortable (no sort key for them).
- Footer: "Pokazano X–Y z N" with previous/next buttons. Empty states reuse existing ones
  (no results vs none yet vs none open).
- Mobile card layout (existing `max-md` table) keeps working; sort control on mobile is a
  small select next to the toolbar.

## Register modal: recipient hints

`getPackageRecipientOptions` additionally returns, per option, `since` (residency `createdAt`).
When a recipient is masked (name is the placeholder) or shows only an email-less identity, the
label gets the relationship and month, e.g. "Mieszkaniec (najemca od 03.2026)", so two masked
tenants are distinguishable. Unmasked names and emails render as today. Translations in pl/en.

## Testing

- Unit: `parsePackageQuery` (defaults, invalid values, clamping).
- Domain (existing test setup against the test DB): status filter, building/apartment/recipient
  filters, sort order, pagination boundaries and `total`, resident isolation (resident never
  sees others' packages regardless of params), masked recipients not matchable via `recipient`.
- Manual in the browser as seeded manager and resident.

## Out of scope

Saved filters, CSV export, bulk actions, changing privacy rules, a dedicated `/packages/new` route.
