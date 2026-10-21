# Motion (`motion/react`) for cards, forms, interactive elements and lists — design

## Goal

Add subtle, consistent motion with `motion/react` where CSS cannot do it well: entrance of cards and sections, conditional form fields and error messages, hover/press on clickable cards, and add/remove/filter/reorder of list items. Modals, dropdowns, selects, sheets and popovers stay on the existing Radix + `tw-animate-css` CSS (already tuned, with reduced-motion handling).

## Decisions (made with the user)

- Dependency `motion` (`import ... from "motion/react"`).
- Item 2 of the user's list (modals, dropdowns, popovers, menus) is NOT migrated.
- Subtle motion: 200–300 ms, ease-out, `y: 10 → 0`, small stagger.

## Foundation

- `lib/motion.ts`: `EASE_OUT = [0.23, 1, 0.32, 1]` (same curve as `--ease-out`), `DURATION = { fast: 0.2, base: 0.3 }`, `STAGGER = 0.05`, `MAX_STAGGERED = 8`.
- `components/motion/MotionProvider.tsx` (client): `LazyMotion` with features loaded asynchronously (`domMax`, needed for `layout`) and `strict`, wrapping `MotionConfig reducedMotion="user"`. Mounted in `app/layout.tsx` inside the theme and intl providers. All animated components use the lightweight `m.*` (`motion/react-m`), never `motion.*`.
- Components (client, in `components/motion/`):
  - `FadeIn`: block with `opacity 0→1`, `y 10→0` (optional `delay`).
  - `Stagger` + `StaggerItem`: container and children appearing one after another; delay = `min(index, MAX_STAGGERED) * STAGGER`.
  - `Collapse`: `AnimatePresence` + height `0↔auto` + opacity for conditional fields and messages.
  - `AnimatedList` + `AnimatedItem`: `AnimatePresence mode="popLayout"` and `layout` for add/remove/filter/reorder; items with `key`.
  - `Interactive`: wrapper with `whileHover { y: -2 }` and `whileTap { scale: 0.98 }` for clickable cards.

## Where it is applied

- **Cards and sections:** dashboard (`app/page.tsx`: apartment card, stat cards, resident cards), `app/profile/page.tsx`, `app/locations/page.tsx`, `app/settings/page.tsx`, posts list (`app/posts/page.tsx`).
- **Forms:** error messages in `components/packages/CreatePackageForm.tsx`, `components/reports/CreateReportForm.tsx`, `components/posts/CreatePostForm.tsx`, `components/posts/EditPostForm.tsx`, `components/admin/CreateMembershipForm.tsx`; the conditional fields in `CreateReportForm` (type select, parking/storage picker, suggestion chips) via `Collapse`.
- **Clickable elements:** dashboard stat cards, post cards, location cards via `Interactive` (keep existing CSS hover colour transitions).
- **Lists:** `components/packages/PackagesList.tsx`, `components/reports/ReportsList.tsx`, posts list, `components/admin/MembershipsTable.tsx` rows (cards via `AnimatedList`/`AnimatedItem`; table rows only where `layout` does not break the table layout: if rows cannot animate safely, animate the empty state ↔ table switch instead). Status badge in `ReportCard` and `PackageCard` cross-fades when the status changes.

## Rules

- Entrance animations run on first mount only; `router.refresh()` does not replay them.
- `reducedMotion="user"` globally; no layout animation outside lists; no animation of server-only trees directly (use the client wrappers).
- Existing CSS transitions on buttons, dialogs, sheets, sidebar and switch are untouched.
- Content must stay visible without JS where feasible: use `initial` only on elements that are decorative entrances; accept hidden-until-hydrated for entrance wrappers (`// ponytail:` note in `FadeIn`).

## Out of scope

Route transitions, modal/menu migration, chart animations, parallax, drag and drop.

## Testing

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `next build` green.
- `lib/motion.ts` constants unit test (curve length 4, `MAX_STAGGERED` positive, `STAGGER` > 0) is unnecessary; skip.
- Browser (no login): `/` and `/settings` animate on first load; with `prefers-reduced-motion` emulation there is no transform animation; no console errors or hydration warnings. Pages behind login are verified by the user.
