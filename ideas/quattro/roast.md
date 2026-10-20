# Quattro: roast

Date: 2026-10-19

## Kill shots (worst first)

1. **Reception won't log parcels.** The whole product needs one desk, in one building, to scan every parcel for four buildings. Nobody on that desk has been asked, and the HOA that employs them has not been contacted. Disproved by: the receptionist logs a week of real parcels without being chased.
2. **No notification, so no product.** The 4-month parcel failed because nobody told the resident. The repo has no email or SMS dependency, so it repeats "go ask at the desk" with a login. Disproved by: a logged parcel reaches the resident in under a minute and they collect it.
3. **No HOA sign-off.** Reception staff, resident data and accounts are the HOA's. Disproved by: a named HOA person saying yes to a pilot.
4. **Board and issues are unvalidated.** Zero evidence of demand, only "good place to add". Competitors already bundle both (BuildingLink, CINC Connect, TownSq). Feature, not a company; free alternative (a chat group) is good enough for the board.
5. **Bus factor of one.** Hosting is about $10/month and you accept it, so cost is not the issue. One person supports reception login problems. Disproved by: a named backup or handover.

## Survived

- The packages pain is real and concrete: a parcel sat 4 months with no notice. Lived experience of 7 years in the complex.
- Single role for reception is enough (one desk now, same logic if other buildings get desks back).
- Reception-owned account creation protects private data. The repo matches: invite-by-email membership, roles and tenant-isolation tests for packages.

## Unanswered

- Parcels per day at the main desk.
- What the desk does today when a parcel arrives.
- Named HOA contact and whether they have heard of this.
- Who supports reception's login problems (hosting is settled: about $10/month, paid by you).

## Repo check

- Packages: built (status flow, audit log, tenant isolation, staff vs resident views).
- Notifications: none. No email or SMS library in `package.json`.
- Issues: nothing exists.
- Board: `Post` is a global blog model (no `communityId`, no author, no building scope), so it needs a new model, not a tweak.
- Single-community assumptions already marked in code (`user.memberships[0]`), which is fine for one complex.

## Riskiest assumption

The reception desk will log every parcel promptly. Cheapest test: this week, ask the main-building receptionist and one HOA contact, then run a 2-week pilot with the current packages screen and notices sent by hand.

## Verdict

**RESHAPE.** Packages plus a notification is a real, narrow product; issues and board are speculation until packages work with real reception staff.

## Reshaped one-liner

For residents of a four-building complex with one staffed reception, a parcel log that emails them the moment a package arrives, instead of walking to the main building to ask.
