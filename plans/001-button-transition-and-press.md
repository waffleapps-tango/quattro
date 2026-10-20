# 001 — Scope button transitions and add press feedback

- **Status**: DONE
- **Commit**: dd9f695
- **Severity**: HIGH
- **Category**: Performance / Physicality
- **Estimated scope**: 1 file, 2 small edits

## Problem

`components/ui/button.tsx:8` uses `transition-all` (animates unintended properties) and no button has press feedback.

```
// components/ui/button.tsx:8 — current (excerpt)
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none ..."
```

## Target

```
// replace `transition-all` with:
transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100
```

Press feedback scale 0.97 (allowed range 0.95–0.98), 150ms ease-out (budget 100–160ms). Use the `ease-out` token from plan 003 if it is done: `ease-(--ease-out)`; otherwise keep Tailwind `ease-out`.

## Repo conventions to follow

- shadcn/ui + `cva` in `components/ui/button.tsx`; edit only the base string in `buttonVariants`.
- `link` variant must not scale: add `active:scale-100` to the `link:` variant string (`"text-primary underline-offset-4 hover:underline"`).

## Steps

1. In `components/ui/button.tsx:8`, replace `transition-all` with the Target string above.
2. In the `link` variant add `active:scale-100`.

## Boundaries

- Do NOT touch any other component. Do NOT change colors or sizes.
- If line 8 no longer contains `transition-all`, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit` and `npm run lint` pass.
- **Feel check**: click-and-hold any button: it shrinks slightly and returns on release; disabled buttons do not scale (they have `pointer-events-none`). With DevTools Animations at 10%, only background/transform animate. With `prefers-reduced-motion: reduce` no scale occurs.
- **Done when**: `grep -n "transition-all" components/ui/button.tsx` returns nothing.
