# 002 — Theme toggle icons: remove scale(0) and transition-all

- **Status**: DONE
- **Commit**: dd9f695
- **Severity**: HIGH
- **Category**: Physicality / Performance
- **Estimated scope**: 1 file, 2 lines

## Problem

`components/ThemeToggle.tsx:22-23` swaps Sun/Moon with `scale-0`, rotation and `transition-all`:

```tsx
<Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
<Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
```

Nothing should appear from `scale(0)`; `transition-all` animates unrelated properties.

## Target

```tsx
<Sun className="h-[1.2rem] w-[1.2rem] scale-100 opacity-100 transition-[opacity,transform] duration-200 ease-out dark:scale-90 dark:opacity-0" />
<Moon className="absolute h-[1.2rem] w-[1.2rem] scale-90 opacity-0 transition-[opacity,transform] duration-200 ease-out dark:scale-100 dark:opacity-100" />
```

Scale 0.9 + opacity (allowed 0.9–0.97), 200ms ease-out. Rotation removed (it is decorative on a frequently-clicked control).

## Repo conventions to follow

- Tailwind utility classes inline, `dark:` variant for theme state (as already used here).

## Steps

1. Replace the two `className` strings on lines 22 and 23 with the Target strings.

## Boundaries

- Do NOT change the dropdown, the Button, or the `sr-only` span.
- If the lines differ from the excerpt, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`.
- **Feel check**: toggle light/dark via the menu; icons crossfade with a slight scale, no spin, no flash of both icons fully visible. At 10% playback confirm only opacity/transform animate.
- **Done when**: `grep -n "scale-0\|transition-all" components/ThemeToggle.tsx` returns nothing.
