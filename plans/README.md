# Animation improvement plans

Audit of the Quattro app at commit dd9f695. Missed opportunities (not planned): fade-in for the form error in `CreatePackageForm`, row feedback after marking a package picked up.

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Scope button transitions + press feedback | HIGH | DONE |
| 002 | Theme toggle: remove scale(0) | HIGH | DONE |
| 003 | Global ease-out tokens | MEDIUM | DONE |
| 004 | Global prefers-reduced-motion | MEDIUM | DONE |
| 005 | Sheet easing and duration | MEDIUM | DONE |
| 006 | Sidebar collapse | MEDIUM | DONE |
| 007 | Switch scoped transition | LOW | DONE |
| 008 | Gate card hover | LOW | DONE |

## Order

1. 003 first (defines tokens used by 001, 005, 006).
2. 001, 002, 004 (independent).
3. 005 (needs 003), 006 (optionally 003).
4. 007, 008.

Dependencies: 005 → 003. 001 and 006 optionally use 003 tokens. 003 and 004 both edit `app/globals.css`; apply sequentially, not in parallel.
