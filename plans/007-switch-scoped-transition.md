# 007 — Switch: scope transition-all

- **Status**: DONE
- **Commit**: dd9f695
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 1 file, 1 token

## Problem

`components/ui/switch.tsx:16` root has `transition-all`; only background color and focus ring change.

## Target

Replace `transition-all` with `transition-[background-color,box-shadow]` on the root only. The thumb already uses `transition-transform` (line 24) and stays as is.

## Repo conventions to follow

- shadcn/ui Radix wrapper; edit the class string only.

## Steps

1. In `components/ui/switch.tsx:16`, change `transition-all` to `transition-[background-color,box-shadow]`.

## Boundaries

- Do NOT edit the thumb. If `transition-all` is not on line 16, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`.
- **Feel check**: toggle a switch (Settings page): thumb slides, track color changes, focus ring still appears on keyboard focus.
- **Done when**: `grep -n "transition-all" components/ui/switch.tsx` returns nothing.
