# My profile (mieszkanie, miejsca, komórki) — design

## Goal

A logged-in user can see everything they are assigned to: community, building, apartment, parking spaces and storage units, plus their own identity and role. Only the user's own data; no household members.

## Decisions (made with the user)

- A dedicated page `/profile` plus a small "My apartment" card on the dashboard (dashboard card links to the page).
- No household members (privacy; can be added later).
- Read-only: assignments are managed by a manager/admin (seed or later admin UI).

## Data

`domain/profile/index.ts` → `getProfile(actor: SessionUser, communityId: string)`:

```ts
{
  firstName: string | null; lastName: string | null; email: string;
  role: Role;
  community: { name: string; address: string | null };
  building: { name: string; address: string | null } | null;   // membership.building ?? apartment.building ?? null
  apartment: { number: string; floor: number | null } | null;
  parkingSpaces: { id: string; number: string; level: string | null; hasEvCharger: boolean }[];
  storageUnits: { id: string; number: string }[];
}
```

Throws `UnauthorizedError` when the actor has no membership in `communityId`. Reuses `listOwnedSpaces` (spaces and units of the member's apartment). Staff without an apartment get `building`/`apartment` null (or the building of their membership) and empty lists.

## `/profile` page

Server component, protected in `middleware.ts`, first membership as elsewhere (`ponytail:` comment, same as `/packages`). Signed out → redirect `/sign-in`; no membership → the existing `WaitingScreen`.

Layout: header (avatar with initials, full name or email, email, role badge using `admin.role.*` labels) and cards:
- "Apartment": community name and address, building name and address, apartment number, floor. If `apartment` is null: `EmptyState` "Your account is not assigned to an apartment".
- "Parking spaces": one row per space (number, level, "EV charger" badge); empty → muted "No parking spaces assigned".
- "Storage units": one row per unit; empty → muted "No storage units assigned".
- Each of the parking/storage cards has a "Report a problem" link to `/reports`.

`app/profile/loading.tsx` skeleton. `generateMetadata` with `meta.profile`.

## Entry points

- `TopBar` user menu item "Profile" becomes a link to `/profile`.
- Dashboard (`app/page.tsx`, members with an apartment): card "My apartment" with one line, for example `Building A, apt 4 · parking P-4 · storage K-4`, and a link "View profile". Hidden when the user has no apartment.

## i18n

New `profile` namespace in `messages/pl.json` and `messages/en.json` (parity test must pass) plus `meta.profile` ("Mój profil" / "My profile") and dashboard card keys. Counts/labels via messages, no hard-coded text.

## Out of scope

Editing assignments, household members, history, prefilled report forms, a sidebar entry.

## Testing

- `domain/profile/index.test.ts`: resident with apartment, parking space and storage unit; staff without apartment (null apartment, empty lists); building falls back to the apartment's building when the membership has none; another apartment's spaces are never included; actor from another community → `UnauthorizedError`.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `next build`.
- Browser (no login): `/profile` redirects to sign-in; the dashboard card and profile with real data are verified by the user after login.
