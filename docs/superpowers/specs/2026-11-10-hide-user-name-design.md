# Hide user name (privacy setting) — design

## Goal
A user can turn off sharing of their first/last name. When off, everyone except that user sees a placeholder such as `Mieszkaniec Budynek A / 4` instead of the name.

## Decisions
- **Scope:** placeholder shown to everyone except the user themself (residents, receptionists, managers, admins).
- **Default:** name shown (`shareName = true`) for existing and new users.
- **Placeholder:** uses the apartment of the context (package's, report's, or profile apartment): `Mieszkaniec <Building> / <Apt>`. No apartment in context: `Mieszkaniec`; for a staff-role user: `Pracownik`.
- **Email:** masked wherever the hidden user's name is masked (the email is the current fallback when a name is missing, so it would defeat the setting).

## Data
- `User.shareName Boolean @default(true)` (Prisma migration).
- Toggle on `/profile`, backed by a server action that updates only the actor's own row. Strings in `messages/*` (pl, en).

## Masking
One helper, `displayPerson(user, ctx, viewer)`, in `domain/`:
- returns the real name (email fallback) if `viewer.id === user.id` or `user.shareName`;
- otherwise returns the placeholder above. It never throws.

All domain queries that return another user's `firstName`/`lastName`/`email` pass through it server-side, so raw values never reach the RSC payload (same principle as the existing `maskAuthor` in `domain/reports`):
- `domain/packages` (staff and resident lists): recipient name; recipient email in the staff list. Staff search by recipient email excludes hidden users.
- `domain/residencies/recipients.ts`: picker option labels and default.
- `domain/reports`: `maskAuthor` also masks staff views of hidden authors, using the report's apartment.
- `domain/profile` people list: co-residents masked; the owner-sees-emails rule does not apply to hidden users.
- A user's own name (greeting, top bar, nav, profile header) is unchanged.

## Tests
- Helper unit tests: self, visible user, hidden with apartment, hidden without apartment, hidden staff.
- Extend packages, reports, profile and recipients domain tests: for a hidden user, neither name nor email is present in data returned to a staff viewer or a resident viewer.
