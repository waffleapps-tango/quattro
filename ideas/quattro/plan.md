## Quattro, implementation plan

**Goal of this plan.** Know whether the main-building reception will log parcels and residents will collect them faster once emailed.

**Riskiest assumption first.** The reception desk will log every parcel promptly.

### Milestone 0: kill-or-continue test

- Talk to the main-building receptionist and one HOA contact this week. Ask how many parcels a day, what happens now, and whether they will use a screen to log them.
- Continue if: the HOA agrees to a pilot and the desk will log parcels. Stop (or rethink) if the HOA refuses or the desk won't add the step. Decide this before the conversations.
- Timebox: one week. No code.

### Milestone 1: thinnest usable thing

For one user: the main-building receptionist.

- Scope: log parcel, mark picked up, resident list, email on log, invite residents by reception.
- **Not in scope:** issue reports, community board, SMS, multi-community UI. The board and issues have no evidence yet.
- Hard part and shortcut: email delivery. Use one transactional email provider with a template, no preferences page.
- Done when: the receptionist logs a real parcel and the resident receives the email.

### Milestone 2: first real usage

- Who: main-building residents who already have apartments in the system, reached through the HOA.
- Signal: share of real parcels logged (target about 80%) and median time from log to pickup.
- Burden: you, the only support. Agree who reception contacts when login fails.

### Milestone 3 and beyond, only if the earlier ones pass

Sketch: second reception desk when other buildings reopen theirs, then issue reports, then the board. Plan only after Milestone 2 reports.

---

## Technical shape

- Stack: Next.js, Prisma, Clerk, Postgres on Cloud SQL (already in place). One new dependency: an email provider.
- Data on day one: apartments and resident emails. The HOA supplies it, which is likely the real bottleneck.
- Expensive to change later: the `communityId` scoping on every table. Already in place for packages, so give any new model (issues, board posts) the same scope from the start.

## Cost and effort

Hosting on GCP is about $10/month (your figure). Email volume is small at one complex. Build time per milestone not estimated.

## Open questions

- Parcels per day at the desk: Milestone 0.
- Current desk practice: Milestone 0.
- Named HOA contact: Milestone 0.
- Who handles support when reception can't log in: before Milestone 2. Hosting is settled: you pay about $10/month.

## Stop conditions

- HOA refuses the pilot.
- Reception logs under about 80% of parcels after two weeks of nudging.
- Residents don't collect faster than before.
