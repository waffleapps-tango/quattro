# Admin usability: users filter + scalable apartments tab

## Problem

- Apartments tab loads every building, every apartment and every resident in one query and renders an invite dialog per row. A 100-apartment building means hundreds of fetched/rendered elements in one call.
- `Apartment.floor` (`Int?`) exists in the schema and overview query, but the UI ignores it.
- Users tab has no filtering, and the users page prefetches all apartments of all buildings for the add-member form.
- Users tab is a table/list while the apartments tab uses Cards.

## Decisions

- Apartments load lazily per floor (floors collapsed, fetch on expand).
- Users filter: building select, then apartment select (apartments fetched on demand), plus email search. State in URL params, filtered server-side.

## Data layer (`domain/residencies/overview.ts`)

All functions call `requireInviter(actor, communityId)` and verify the building belongs to the community.

- `listBuildingFloors(actor, communityId)`: per building `{ id, name, floors: { floor: number | null; total: number; vacant: number }[] }`. Counts only, no apartment rows. Floors sorted ascending, `null` last.
- `listFloorApartments(actor, communityId, buildingId, floor, { onlyVacant })`: apartments of one floor with residents. Reuses current masking (`maskPerson`) and numeric number sort.
- `listApartmentsLite(actor, communityId, buildingId)`: `{ id, number, floor }[]` for selects.
- A single `apartmentSelect` constant and `toOverviewApartment` mapper define what an apartment row carries. New apartment fields are added there and flow to `ApartmentRow`.

Server actions in `actions/` wrap the floor and lite queries for client components.

## Apartments tab

- Per building Card: header with total/vacant summary; one collapsible section per floor ("Piętro N · X mieszkań · Y wolne"); `null` floor shown as "Bez piętra", last.
- Floor body fetched on first expand and cached in component state. The "only vacant" switch hides floors with 0 vacant and refetches expanded floors with `onlyVacant`.
- One `ApartmentRow` component renders an apartment. `InviteToApartmentDialog` mounts its body only when open.

## Users tab

- Filter bar: building select, apartment select (enabled once a building is chosen, loaded via action), email search. URL params `building`, `apartment`, `q`.
- `listMembershipsForCommunity` accepts `{ buildingId?, apartmentId?, q? }`; apartment filter uses `user.residencies.some({ apartmentId })`, building filter uses `residencies.some({ apartment: { buildingId } })`, `q` is case-insensitive email contains. Community scoping unchanged.
- Rows rendered as Cards at all widths (matching apartments tab); the table and `xl` dual layout are removed. Content per card: email + pending badge, apartment chips with remove, role select, resend/remove actions.
- `CreateMembershipForm` drops the `apartmentsByBuilding` prop and uses the on-demand loader. The users page no longer prefetches apartments.

## Testing

Vitest next to existing domain tests: floor grouping/counts (incl. null floor, vacant), `listFloorApartments` (onlyVacant, wrong building rejected), membership filters. Manual browser check of both tabs with seeded data.

## Out of scope

- Pagination of the users list.
- Admin UI to edit apartment floor values.
