# 003 — Add ease-out tokens and apply to tw-animate-css animations

- **Status**: DONE
- **Commit**: dd9f695
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion
- **Estimated scope**: 1 file (`app/globals.css`), ~12 lines

## Problem

`tw-animate-css` defines `--animate-in: enter var(--tw-animation-duration,var(--tw-duration,.15s)) var(--tw-ease,ease) ...` (and the same for `--animate-out`). With no `--tw-ease` set, every dialog, alert dialog, select, dropdown and sheet enters with the weak default `ease`. The app has no easing tokens (`app/globals.css` has none).

## Target

Add to `app/globals.css`, directly after the `@theme inline { ... }` block:

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --tw-ease: var(--ease-out);
}
```

`--tw-ease` is the variable tw-animate-css reads, so every `animate-in`/`animate-out` picks up the strong ease-out with no component edits.

## Repo conventions to follow

- Design tokens are CSS variables on `:root` in `app/globals.css` (colors, `--radius`). Follow that placement.

## Steps

1. Insert the `:root` block above after the `@theme inline` block (it may be a separate `:root` rule from the existing color one).
2. Do not edit components.

## Boundaries

- Do NOT change durations here. Do NOT touch `components/ui/*`.
- If `--tw-ease` is already defined somewhere, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`; `npm run build` succeeds.
- **Feel check**: open the "Dodaj paczkę" dialog and a Select: the entrance should start fast and settle gently; compare against git stash if unsure. Computed style of an open dialog: `animation-timing-function` is `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Done when**: tokens exist and the computed timing function above is observed.
