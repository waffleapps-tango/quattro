# 004 — Add global prefers-reduced-motion handling

- **Status**: DONE
- **Commit**: dd9f695
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`app/globals.css`), ~12 lines

## Problem

`grep -rn "prefers-reduced\|motion-reduce" app components` returns nothing. Dialogs zoom, sheets slide, the sidebar resizes, and icons scale for users who asked for less motion.

## Target

Append to `app/globals.css` (outside any `@layer`, at the end of the file):

```css
@media (prefers-reduced-motion: reduce) {
  /* tw-animate-css reads these variables: drop movement, keep opacity fades */
  [data-state] {
    --tw-enter-scale: 1;
    --tw-exit-scale: 1;
    --tw-enter-translate-x: 0;
    --tw-enter-translate-y: 0;
    --tw-exit-translate-x: 0;
    --tw-exit-translate-y: 0;
  }
}
```

Fades (`fade-in-0`/`fade-out-0`) remain, so state changes still read. Reduced motion means gentler, not none.

## Repo conventions to follow

- Plain CSS in `app/globals.css`; the cursor block added earlier is also appended unlayered at the end.

## Steps

1. Append the block above at the end of `app/globals.css`.

## Boundaries

- Do NOT disable `transition-colors` hover feedback or opacity.
- Do NOT edit components. Sheet slide uses `transition` + the same variables, so it is covered; if it still moves, report instead of improvising.

## Verification

- **Mechanical**: `npm run build`.
- **Feel check**: DevTools → Rendering → "Emulate prefers-reduced-motion: reduce". Open dialog (fades only, no zoom), mobile menu sheet (no slide, fade only), select/dropdown (no zoom). Normal mode unchanged.
- **Done when**: the above holds in both modes.
