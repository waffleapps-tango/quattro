# UI Batch: Mobile Fixes, Moderation, Surveys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 14 requested changes: admin settings (unregistered-days window, comment-hiding permissions), comment paging and hiding, surveys, mobile layout/scroll fixes, collapsible filters, loaders, theme-neutral backdrops.

**Architecture:** One Prisma migration up front carries every schema change (Community settings, Comment hide fields, Survey models) so later tasks never collide on migrations. Domain logic lives in `domain/*` with vitest tests on the shared local Postgres; server actions in `actions/*` stay thin; UI in `components/*`. Mobile scroll moves from an inner `overflow-y-auto` container to normal document scroll with a sticky TopBar.

**Tech Stack:** Next.js 15, React 19, Prisma 6/Postgres, Clerk, next-intl (`messages/en.json` + `messages/pl.json`, both must stay in key parity: `i18n/messages.test.ts`), Radix/shadcn, Tailwind 4, vitest.

## Global Constraints

- Every new user-facing string goes into BOTH `messages/en.json` and `messages/pl.json` (Polish is the primary language).
- Email inputs keep `maxLength={254}`; new text inputs get a `maxLength` matching their zod `.max()`.
- Reuse existing helpers: `Button loading`, `components/system/nav-pending.tsx`, `ReceptionApprovalSwitch.tsx` (pattern for settings switches), `CommunityNameForm.tsx` (pattern for settings cards), `STAFF_ROLES` in `domain/packages/roles.ts`, `writeAuditLog`.
- Authorization lives in `domain/*` (throw `UnauthorizedError`), never only in UI.
- Verify at the end: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (vitest empties the local DB: reseed with `npm run db:seed && npx tsx prisma/seed-test-users.ts`).
- Do NOT touch `.idea/`. Do NOT run migrations against GCP; only local (`npx prisma migrate dev`). Commit per task.
- Mobile checks: browser at 375px width via the dev server (`npm run dev`, impersonation `NEXT_PUBLIC_E2E_IMPERSONATE=1`, `/api/dev/impersonate?as=admin`).

## File Map

| Area | Files |
| --- | --- |
| Schema | `prisma/schema.prisma`, new migration |
| Admin settings | `app/admin/community/page.tsx`, `app/admin/requests/page.tsx`, `domain/join-requests/index.ts`, `domain/communities/settings.ts` (new), `actions/community.ts`, `components/admin/UnregisteredDaysForm.tsx` (new), `components/admin/CommentModerationSettings.tsx` (new), `components/admin/MembershipsTable.tsx` |
| Comments | `domain/engagement/comments.ts`, `actions/engagement.ts`, `components/feed/Comments.tsx`, `domain/engagement/targets.ts` |
| Surveys | `domain/surveys/index.ts` (new), `actions/surveys.ts` (new), `components/posts/*`, `components/feed/SurveyBlock.tsx` (new), `app/posts/page.tsx` |
| Layout | `app/layout.tsx`, `components/TopBar.tsx`, `components/MainNavigation.tsx`, `components/ui/dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `components/info/*`, `app/reports/page.tsx`, `app/posts/page.tsx` |
| Client UX | `components/profile/ApartmentPeople.tsx`, `components/ui/collapsible-filters.tsx` (new), filter components, posts tabs |

---

### Task 1: Schema migration for everything

**Files:** Modify `prisma/schema.prisma`; create migration via prisma.

**Produces (later tasks rely on these exact names):**
- `Community.unregisteredDays Int @default(7)`, `Community.receptionCanHideComments Boolean @default(false)`, `Community.managerCanHideComments Boolean @default(false)`
- `Comment.hiddenAt DateTime?`, `Comment.hiddenById String?` (relation `hiddenBy User? @relation("CommentHiddenBy", ..., onDelete: SetNull)`, back-relation `hiddenComments Comment[] @relation("CommentHiddenBy")` on User)
- `enum PostKind { ANNOUNCEMENT NEIGHBOR SURVEY }`
- `model SurveyOption { id, postId, label String, position Int; post Post @relation(onDelete: Cascade); votes SurveyVote[]; @@index([postId, position]) }`
- `model SurveyVote { id, postId, optionId, userId, createdAt; @@unique([postId, userId]); relations with onDelete: Cascade }`
- `Post.surveyOptions SurveyOption[]`, `Post.surveyVotes SurveyVote[]`, `User.surveyVotes SurveyVote[]`

- [ ] Edit the schema as above.
- [ ] Run `npx prisma migrate dev --name ui_batch_moderation_surveys` (local DB in docker `quattro-postgres-1` must be up) and `npx prisma generate`.
- [ ] Run `npx tsc --noEmit`; fix exhaustive `PostKind` switches that now miss `SURVEY` (grep `PostKind`/`"NEIGHBOR"`).
- [ ] Commit: `feat: schema for comment hiding, unregistered window, surveys`.

### Task 2: Admin settings and requests list (items 1, 4-settings, 14)

**Interfaces:**
- Produces `domain/communities/settings.ts`: `updateUnregisteredDays(actor, communityId, days: number)` (MANAGER/ADMIN only, integer 1..365, audit-logged) and `updateCommentModeration(actor, communityId, { receptionCanHideComments?: boolean; managerCanHideComments?: boolean })` (ADMIN only for the manager flag; MANAGER or ADMIN for the reception flag — admin always can, so the manager flag is only editable by ADMIN).
- `listUsersWithoutRequest(actor, communityId)` now filters `createdAt >= now - community.unregisteredDays days`, no `take: 50` cap kept at 200 as safety.

- [ ] Failing vitest for both domain functions and for the date filter in `domain/join-requests/index.test.ts`; run, see fail.
- [ ] Implement domain functions + zod actions in `actions/community.ts` (pattern: existing `updateCommunityNameAction`).
- [ ] New client cards `UnregisteredDaysForm.tsx` (number input 1..365, `Button loading`) and `CommentModerationSettings.tsx` (two switches, copy the structure of `ReceptionApprovalSwitch.tsx`), rendered on `app/admin/community/page.tsx` as cards styled like `CommunityNameForm`.
- [ ] `app/admin/requests/page.tsx`: card hint shows the configured number of days ("ostatnie {days} dni").
- [ ] Item 14: in `components/admin/MembershipsTable.tsx` the role Select shows a spinner and is disabled while the role-change action is pending; use `useTransition` + `Loader2` the same way as other loaders.
- [ ] Add messages (en+pl), run tests, commit.

### Task 3: Comments paging and hiding (items 4, 11)

**Interfaces:**
- `CommentView` gains `hidden: boolean`, `canHide: boolean`. A hidden comment has `body: ""` for everyone except the viewer when `canHide` (moderator) — moderators receive the text plus `hidden: true` so they can unhide. The author sees a "hidden by moderator" placeholder.
- `listComments(actor, t, { cursor?: string, take?: number })` returns `{ items: CommentView[]; nextCursor: string | null }`; page of top-level comments, default `take = 5`, newest-last order preserved, each top-level with all its replies. `addComment/editComment/deleteComment` keep returning the full loaded thread shape → change to return the refreshed first N loaded (client passes how many top-level comments are currently loaded: `loaded` param).
- `hideComment(actor, t, commentId, hidden: boolean)`: allowed when actor role is ADMIN, or MANAGER and `community.managerCanHideComments`, or RECEPTIONIST and `community.receptionCanHideComments`; residents never. Writes audit log `COMMENT_HIDDEN` / `COMMENT_UNHIDDEN`.
- `viewerCanHide(role, community)` exported from `domain/engagement/comments.ts`.

- [ ] Tests first in `domain/engagement/comments.test.ts`: paging cursor stable, hide permission matrix (resident/reception off/on, manager off/on, admin), hidden body masking.
- [ ] Implement domain, then `actions/engagement.ts` (`hideCommentAction`, paged `listCommentsAction(target, cursor)`).
- [ ] `components/feed/Comments.tsx`: initial load shows first page, "Załaduj więcej komentarzy" button with `loading`, hide/unhide link for `canHide`, placeholder text for hidden. Counts from `Engagement` unchanged.
- [ ] Messages en+pl, tests, commit.

### Task 4: Surveys (item 13)

**Interfaces:** `domain/surveys/index.ts`: `createSurveyPost(actor, { title, content, options: string[2..8 each ≤120 chars] })` (staff only: same roles that create ANNOUNCEMENT posts today — check `domain/posts/index.ts`), `castVote(actor, postId, optionId)` (upsert on `[postId, userId]`, member of the post's community, post kind SURVEY), `getSurveyResults(actor, postId)` → `{ options: { id, label, votes, mine: boolean }[]; total: number; myVoteId: string | null }`.

- [ ] Read `components/posts/PostFields.tsx`, `CreatePostForm.tsx`, `domain/posts/index.ts`, `app/posts/page.tsx` first to mirror how `kind` is chosen.
- [ ] Failing tests: staff can create, resident cannot create, option count bounds, vote upsert changes vote, non-member vote rejected.
- [ ] Implement domain + `actions/surveys.ts`; add "Ankieta" to the Rodzaj select (visible only to staff), dynamic options list (add/remove option inputs, min 2, max 8).
- [ ] `components/feed/SurveyBlock.tsx`: radio-style options with results bars once voted; optimistic with loader; rendered by the post card for `kind === "SURVEY"`.
- [ ] Messages en+pl, tests, commit.

### Task 5: Layout, scroll, modals, cards (items 2, 6, 8, 9, 10, 12)

- [ ] Item 2: `app/layout.tsx`: replace `h-screen` + inner `<main className="flex-1 overflow-y-auto">` with document scroll: wrapper `min-h-dvh flex`, sidebar `sticky top-0 h-dvh`, TopBar `sticky top-0 z-30` (blur bg), `<main>` without overflow. Check that the Radix scroll-lock and the admin tabs still behave. Verify on 375px: no scroll "capping", topbar stays.
- [ ] Item 8: `components/ui/dialog.tsx` overlay `bg-primary/40` → `bg-black/50 backdrop-blur-sm` (match alert-dialog/sheet). Verify in coffee palette.
- [ ] Item 10: `components/ui/dialog.tsx` content: `max-h-[calc(100dvh-2rem)] overflow-y-auto` already present; fix Nowy Post/other forms whose inner containers break it (grid with `min-h-0`), ensure sticky footer/buttons reachable; audit every `DialogContent` usage at 375x667 and landscape.
- [ ] Item 9: cards full width on mobile: reduce `main` padding to `px-0 sm:px-6` for card lists or make cards edge-to-edge (`max-sm:rounded-none max-sm:border-x-0`) in `components/ui/card.tsx`; keep page headers padded.
- [ ] Item 6: `components/info/InfoSectionCard.tsx`: `min-w-0`, `break-words [overflow-wrap:anywhere]` on phone/name/note; contact rows `flex-wrap`; verify with a 40-char phone number.
- [ ] Item 12: `app/reports/page.tsx` header: same structure/classes as the header in `app/posts/page.tsx` (title + subtitle left, primary action right, same spacing/typography).
- [ ] Commit per item group.

### Task 6: Client UX (items 3, 5, 7)

- [ ] Item 3: `components/profile/ApartmentPeople.tsx`: remove button stays on the same row on 375px (`min-w-0` text column, `shrink-0` button, email `truncate`); after confirm, hide the removed person immediately (optimistic local `removedIds` set; restore + toast on failure) instead of waiting for revalidate.
- [ ] Item 5: new `components/ui/collapsible-filters.tsx` (title row with chevron toggle, `Collapse` from `components/motion/Collapse.tsx` or CSS grid-rows transition, state in `useState`, default open on desktop, closed on mobile via media check after mount); wrap filters in packages toolbar, reports list, admin memberships filter, anything else found with `grep -rn "Filter"`.
- [ ] Item 7: Tablica tabs (ANNOUNCEMENT / NEIGHBOR / SURVEY switch) show a loader on switch using `components/system/nav-pending.tsx` (`useNavTransition`, `<NavPending>`).
- [ ] Commit per item.

### Task 7: Final verification

- [ ] `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` all green.
- [ ] Browser walk-through at 375px and desktop for each of the 14 items; report what was not verified.
- [ ] Final code review pass (`superpowers:requesting-code-review`), then ask user about push and GCP migration (`npm run db:migrate:gcp`).

## Self-review

- Spec coverage: 1→T2, 2→T5, 3→T6, 4→T1+T2+T3, 5→T6, 6→T5, 7→T6, 8→T5, 9→T5, 10→T5, 11→T3, 12→T5, 13→T1+T4, 14→T2. All 14 mapped.
- Names consistent across tasks: `unregisteredDays`, `receptionCanHideComments`, `managerCanHideComments`, `hiddenAt`, `viewerCanHide`, `SurveyOption`, `SurveyVote`.
