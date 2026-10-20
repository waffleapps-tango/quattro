# UX polish (system states, language, loaders, empty states, home) — design

## Goal

Make Quattro behave like a finished website: no default Next.js error pages, no silent redirects, visible loading, helpful empty states, one language (Polish), and a useful home page. Scope is sub-projects A, B, C and D from the brainstorm. Feature work (ticket detail view, comments, photos, notifications, search) is out of scope.

## Decisions (made with the user)

- 404 style: "building with one lit window" illustration, drawn as inline SVG. Layout is always one vertical column, on every screen width: illustration, big code, text 1, text 2, button(s).
- The same screen component serves 404, error, 403 and "waiting for invitation".
- Language: Polish only, no i18n library.
- Home page for signed-in users: role-aware dashboard. Residents see their packages and reports; staff see counters and shortcuts.
- The user will verify the result after the work is done; reasonable details are left to the implementer.

## A. System states

`components/system/StatusScreen.tsx`: full-viewport (`fixed inset-0 z-50`, solid `bg-background`, so it covers the sidebar and top bar), centered, single column. Props: `variant: "not-found" | "error" | "forbidden" | "waiting"`, optional `title`, `description`, `actions` (children). It renders the illustration for the variant, the code (`404`, `Ups`, `403`, none for waiting), text 1 (title), text 2 (description) and the buttons.

`components/system/StatusIllustration.tsx`: inline SVG of an apartment block. Colors come from theme CSS variables (`--muted`, `--muted-foreground`, `--accent`, `--primary`, `--background`, `--destructive`) so every palette and light/dark mode works. Variants:

| Variant | Illustration | Code | Title | Description |
|---------|--------------|------|-------|-------------|
| not-found | one lit window | 404 | Ta klatka prowadzi donikąd | Nie znaleźliśmy tej strony. Wróć na dół, do strony głównej. |
| error | dark window with a small red cross | Ups | Coś poszło nie tak | Awaria po naszej stronie. Spróbuj ponownie za chwilę. |
| forbidden | closed door with a padlock | 403 | Tu wchodzą tylko osoby z kluczem | Twoje konto nie ma dostępu do tej strony. |
| waiting | lit window, door ajar | none | Czekamy na zaproszenie | Twoje konto nie jest jeszcze przypisane do wspólnoty. Poproś administratora o dostęp. |

The lit window pulses softly (CSS animation, disabled under `prefers-reduced-motion`).

Wiring:
- `app/not-found.tsx` renders `StatusScreen variant="not-found"` with a "Wróć na stronę główną" link to `/`.
- `app/error.tsx` (client) renders the error screen with "Spróbuj ponownie" (`reset()`) and a link home; it logs the error with `console.error` and shows only `error.digest` (small, muted) if present. Never shows `error.message`.
- `app/global-error.tsx` (client, own `<html lang="pl"><body>`) imports `./globals.css`, renders the same screen.
- `components/system/AccessDenied.tsx` = `StatusScreen variant="forbidden"` with a home link. `/admin` renders it instead of silently redirecting when the user is signed in but not ADMIN/MANAGER. Signed-out users still go to `/sign-in`.
- A signed-in user without any membership sees `StatusScreen variant="waiting"` (with a sign-out button) on the home page, packages and reports pages instead of the current one-line text.

## B. Language and metadata

- `<html lang="pl">`; default title "Quattro", description "Paczki i zgłoszenia dla Twojego osiedla."; `title.template = "%s | Quattro"` and each page exports `metadata.title` in Polish (Paczki, Zgłoszenia, Lokalizacje, Posty, Ustawienia, Administracja, Logowanie, Rejestracja).
- Navigation (desktop and mobile): Strona główna, Ustawienia, Paczki, Zgłoszenia, Lokalizacje, Posty, Administracja.
- TopBar: "Cześć, {imię}", menu Profil / Ustawienia / Wyloguj się, buttons Zaloguj się / Załóż konto.
- Translate user-visible English text on `app/locations`, `app/settings` (+ `components/settings`), `app/posts`, `components/posts`, `components/admin`, and server action messages ("Not signed in" → "Nie jesteś zalogowany", etc.). Code identifiers, database values and role names stay unchanged; role labels shown to users: Mieszkaniec, Recepcja, Zarządca, Administrator.
- Dates stay `dd.MM.yyyy HH:mm`.

## C. Loaders and empty states

- Add `components/ui/skeleton.tsx` (shadcn pattern: `animate-pulse rounded-md bg-muted`).
- Route-level `loading.tsx` with page-shaped skeletons for `app/packages`, `app/reports`, `app/posts`, `app/locations`, `app/settings`, `app/admin` (title skeleton plus 3-6 card or row skeletons matching the real layout), plus `app/loading.tsx` for the home dashboard.
- Navigation items show a small spinner while their link is pending (`useLinkStatus` from `next/link`).
- No global top progress bar (no new dependency).
- `components/system/EmptyState.tsx`: icon, title, one-line hint, optional action button. Used by: packages list ("Brak paczek", staff: "Dodaj paczkę"; resident: "Gdy przyjdzie paczka, zobaczysz ją tutaj."), reports list ("Brak zgłoszeń", "Nowe zgłoszenie" action via the existing form), posts, admin members.
- Existing buttons already show pending text; add the same pending/disabled state wherever a form button lacks it (check `components/posts`, `components/admin`, `components/settings`).

## D. Home page (`app/page.tsx`)

Signed out: a short welcome (name, one sentence, "Zaloguj się" and "Załóż konto" buttons) in the normal layout. Replaces the "Click me" button.

Signed in, no membership: the "waiting" screen.

Signed in with membership: heading "Dzień dobry, {imię}", then sections (hidden when empty except the first):

- Resident:
  - "Paczki do odbioru": count and up to 3 newest (building / apartment, courier, received date), link to `/packages`.
  - "Moje zgłoszenia": count of open reports (status NEW or IN_PROGRESS) and up to 3 newest with status badge, link to `/reports`.
  - Shortcut button "Nowe zgłoszenie" linking to `/reports`.
- Staff (RECEPTIONIST, MANAGER, ADMIN):
  - Counters (cards): "Paczki czekające na wydanie" (status RECEIVED or READY_FOR_PICKUP), "Nowe zgłoszenia" (status NEW), "Pilne zgłoszenia" (urgent and not in a final status). Each links to the matching list.
  - Shortcut buttons: "Dodaj paczkę" (to `/packages`), "Zgłoszenia" (to `/reports`); ADMIN/MANAGER also "Administracja".

Data comes from the existing `listPackagesForViewer` and `listReports`; the pure summarising logic lives in `domain/dashboard/summary.ts` (`summarizeDashboard`) and is unit-tested. In-memory counting is acceptable for the MVP data size (comment with `ponytail:`, move to `count()` queries if lists grow).

## Out of scope

Ticket detail page, comments, photos, notifications, search, legal pages (regulamin, polityka prywatności), PWA, i18n library, top progress bar.

## Testing

- Vitest unit tests for `summarizeDashboard` (resident vs staff, counts, urgent/final handling, ordering, limit of 3).
- `npx tsc --noEmit`, `npm run lint`, `npm test` stay green; `npm run build` must succeed.
- Manual check in the browser without login: a non-existent URL shows the 404 screen in one column at desktop and mobile widths, in light and dark, with the home button working. Pages behind login are verified by the user.
