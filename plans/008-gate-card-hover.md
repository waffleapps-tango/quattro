# 008 — Gate post-card hover to real hover devices

- **Status**: DONE (no change needed: no custom hover variant, Tailwind v4 default is already gated by hover media query)
- **Commit**: dd9f695
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: 1 file, 1 token

## Problem

`app/posts/page.tsx:40`: `<Card className="hover:bg-accent transition-colors">`. On touch devices the tap leaves a stuck hover background.

## Target

`<Card className="transition-colors [@media(hover:hover)]:hover:bg-accent">`

(Tailwind v4's `hover:` variant is already gated by `@media (hover: hover)` by default, so first check whether the project's Tailwind config overrides this; if the default is intact, this plan is already satisfied: mark it DONE with a note and make no change.)

## Repo conventions to follow

- Inline Tailwind classes.

## Steps

1. Check `app/globals.css` / Tailwind config for a custom `hover` variant. If none, mark plan DONE (no change needed).
2. Otherwise apply the Target class.

## Boundaries

- Only `app/posts/page.tsx:40`. STOP and report if the line differs.

## Verification

- **Mechanical**: `npx tsc --noEmit`.
- **Feel check**: in DevTools device emulation (touch), tap a card: no lingering highlight. On desktop, hover still tints.
- **Done when**: behavior above or plan marked DONE with the reason.
