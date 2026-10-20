# 005 — Sheet (mobile nav): ease-out curve and shorter duration

- **Status**: DONE
- **Commit**: dd9f695
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, 1 line
- **Depends on**: 003 (for `--ease-drawer`)

## Problem

`components/ui/sheet.tsx:61` (used by `components/TopBar.tsx` for the mobile menu):

```
"... shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
```

Entering with `ease-in-out` is slow at the start, and 500ms is long for a nav drawer.

## Target

Replace `ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500` with:

```
ease-(--ease-drawer) data-[state=closed]:duration-250 data-[state=open]:duration-300
```

`--ease-drawer` = `cubic-bezier(0.32, 0.72, 0, 1)` (defined in plan 003). Open 300ms, close 250ms.

## Repo conventions to follow

- Tailwind v4 arbitrary variable syntax `ease-(--name)`; tokens in `app/globals.css`.

## Steps

1. Do plan 003 first (or add `--ease-drawer` yourself).
2. Edit the single class string in `components/ui/sheet.tsx:61` as above.

## Boundaries

- Do NOT touch overlay or side variants (lines 63-69). If the line differs, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`.
- **Feel check**: narrow the window below `md`, open/close the menu repeatedly: opens quickly and settles softly, closing is slightly faster, no hesitation at the start. At 10% playback the start is fast, end is slow.
- **Done when**: no `ease-in-out` or `duration-500` remains in `sheet.tsx`.
