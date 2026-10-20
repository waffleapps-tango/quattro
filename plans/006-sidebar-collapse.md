# 006 — Sidebar collapse: scope transition and fade labels

- **Status**: DONE
- **Commit**: dd9f695
- **Severity**: MEDIUM
- **Category**: Performance / Physicality
- **Estimated scope**: 1 file, 3 edits
- **Depends on**: 003 (optional, for `--ease-in-out`)

## Problem

`components/MainNavigation.tsx:85`:

```tsx
"hidden md:flex flex-col h-full border-r bg-background transition-all duration-300",
isCollapsed ? "w-16" : "w-64"
```

`transition-all` animates unintended properties, and the labels are conditionally rendered (`{!isCollapsed && <span>...}`, line ~125 and the "Quattro" title ~92) so they pop in/out instantly while the width animates.

## Target

- Container: `transition-[width] duration-200 ease-(--ease-in-out)` (on-screen movement; `cubic-bezier(0.77, 0, 0.175, 1)`).
- Labels always rendered, hidden with opacity and no wrapping:

```tsx
<span className={cn("whitespace-nowrap overflow-hidden transition-opacity duration-150 ease-out", isCollapsed && "opacity-0 w-0")}>{route.title}</span>
```

Same pattern for the "Quattro" title span (remove the `!isCollapsed &&` condition). Keep `aria-hidden={isCollapsed}` on the hidden spans; add `title={route.title}` on the Link when collapsed so the icon keeps a name.

## Repo conventions to follow

- `cn()` from `@/lib/utils` for conditional classes, as already used in this file.

## Steps

1. Replace `transition-all duration-300` on line 85 with `transition-[width] duration-200 ease-(--ease-in-out)` (use `ease-in-out` if plan 003 is not done).
2. Replace the "Quattro" `{!isCollapsed && <span>}` with an always-rendered span using the class pattern above.
3. Same for the route label span in the nav map.

## Boundaries

- Do NOT change routes, roles or the toggle button. Width is a layout property; accept it (rare interaction). Do not rewrite with transforms.
- If the code differs, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`; `npm run lint`.
- **Feel check**: click the collapse toggle repeatedly (spam): width reverses smoothly from the current value, labels fade rather than pop, no text wraps mid-animation. At 10% playback confirm only width/opacity animate.
- **Done when**: no `transition-all` in `MainNavigation.tsx`.
