---
name: stitch-prompt
description: Generate a ready-to-paste Google Stitch prompt for one Quattro screen or route (e.g. /packages, /reports, /admin), built from the real code. Use when the user asks for a Stitch prompt, a redesign prompt, or a UI-generation prompt for a view, page or route.
---

# stitch-prompt

Produce ONE copy-pasteable prompt for Google Stitch that redesigns an existing Quattro screen
using the already-established design system and shell. Never invent features.

## Inputs

- A route or screen name (`/packages`, "reports", "admin"). If missing or ambiguous, ask once.
- Optional role (RESIDENT / RECEPTIONIST / MANAGER / ADMIN). If a screen differs by role, produce
  one prompt per role variant (as in the library) unless the user names one.

## Steps

1. Read `docs/stitch-screen-prompts.md`. It holds the **Shared block** and one screen block per
   existing route. This is the baseline and the house style.
2. Read the live code for the route so the prompt matches today's behavior, not the doc's snapshot:
   - `app/<route>/page.tsx` (role checks, searchParams, data loaded)
   - the components it renders under `components/<area>/`
   - `domain/<area>/` for rules (e.g. `domain/reports/transitions.ts`, `catalog.ts`)
   - `prisma/schema.prisma` for the fields shown
   - `messages/en.json` and `messages/pl.json` for real labels and copy
   If code and the library disagree, trust the code and say so in one line after the prompt.
3. Fill the screen block: name + route, primary role, primary user goal, existing functionality
   (what the UI really does: filters, dialogs, actions, empty/loading/error states, role differences),
   and a `Do not add:` line listing nearby things that do NOT exist (so Stitch won't invent them).
4. For a route with no entry in the library (new page), build the block from the code using the
   same structure, and propose appending it to `docs/stitch-screen-prompts.md`.

## Output format

Print the Shared block followed by the screen block inside a single fenced code block, so the user
can copy it in one click. Then at most three short lines: assumptions, code/doc mismatches, anything
the user should check. Do not add commentary inside the block.

## Rules

- Describe only behavior present in code. Anything planned but not built goes in `Do not add`.
- Keep the content request in Polish (realistic Polish data); the prompt itself stays English.
- Always state that the design system and shell are fixed references (already in the Shared block).
- Mention the current limits when relevant: first-community-only (no switcher), posts have no role
  checks, settings notifications switch is local only.
- One screen per prompt. Never bundle routes.
