# Tablica: content model and routes (piece 1 of 2)

## Goal

The app handles three kinds of community content. Two of them share one feed and one is a
ticket queue:

| Kind | Who writes | Where | Example |
|---|---|---|---|
| HOA alert (`ANNOUNCEMENT`) | staff (manager, admin) | Tablica, pinned until a date | fire alarm test on 01.02 |
| Neighbor post (`NEIGHBOR`) | any member of the community | Tablica | "can someone lend me sugar?" |
| User alert (Report, unchanged model) | any member | Zgłoszenia | leaking pipe in the garage |

Piece 2 (separate spec) adds reactions and comments to all three. This piece prepares one
card shell so piece 2 plugs into one place.

"Staff" in this spec means MANAGER or ADMIN (receptionists are residents for posts, as today).

## Decisions (agreed with user)

- Two routes: `/posts` becomes "Tablica" (announcements + neighbor posts); `/reports`
  ("Zgłoszenia") stays a separate ticket route.
- Announcements can be pinned until an optional date ("ważne do"); after it they fall back into
  the chronological feed.
- Extend the existing `Post` table (not a new table, not merging Report into Post).

## Data model

`Post` gains:

- `communityId String` (required, FK to Community). Today posts are global; this fixes it.
- `authorId String?` (FK to User). Nullable only because existing rows have no author.
- `kind PostKind` with `enum PostKind { ANNOUNCEMENT NEIGHBOR }`, default `ANNOUNCEMENT`.
- `pinnedUntil DateTime?`, honoured only for `ANNOUNCEMENT`.
- `@@index([communityId, kind, createdAt])`.

Migration: add columns nullable, backfill `communityId` of existing rows with the oldest
community (`ORDER BY "createdAt" LIMIT 1`) and `kind = ANNOUNCEMENT`, then set `communityId`
NOT NULL. If posts exist but no community does, the migration fails loudly (does not happen in
any real environment). Applying it to Cloud SQL stays the existing manual step
(`npm run db:migrate:gcp`); never in the build.

`slug` stays globally unique (it already is and is generated with a random suffix).

## Domain (`domain/posts/index.ts`)

All Post access moves out of pages and `actions/actions.ts` into the domain:

- `listPosts(actor, communityId, { kind? })`: community-scoped. Order: announcements with
  `pinnedUntil >= now` first (by `pinnedUntil` asc), then everything else by `createdAt` desc.
  Pinned announcements are not repeated in the chronological part. Returns author with the
  existing privacy masking (`maskPerson`).
- `getPostBySlug(actor, slug)`: 404 (NotFoundError) when the post is in another community.
- `createPost(actor, communityId, input)`: `kind = ANNOUNCEMENT` requires staff
  (MANAGER/ADMIN); `NEIGHBOR` requires any membership. `pinnedUntil` is dropped for NEIGHBOR.
  An ANNOUNCEMENT notifies every member of the community (new notification type
  `POST_ANNOUNCEMENT` with payload `{ postId, slug, title }`, text in
  `notifications.types.POST_ANNOUNCEMENT`), dispatched like other notifications.
- `updatePost` / `deletePost`: the author may edit and delete their own post; staff may delete
  any post and edit announcements. Nobody can change `kind` after creation.
- `canWritePosts` is replaced by two predicates: `canPostAnnouncement(membership)` and
  `canEditPost(actor, post)`.

Audit log entries for create/update/delete, same pattern as packages and reports.

## UI

- Navigation label "Posty" becomes "Tablica" (pl) / "Board" (en). URL stays `/posts`.
- Feed header keeps the eyebrow/heading/description pattern; filter chips
  `Wszystko | Ogłoszenia | Sąsiedzi` drive `?kind=announcement|neighbor` (default: all).
- Create dialog: residents get a neighbor post form (title, content). Staff additionally pick
  the kind; for an announcement they can set "Przypięte do" (date input, optional).
- `FeedCard` (`components/feed/FeedCard.tsx`) replaces `PostCard` as the shared shell:
  eyebrow (kind label), optional badges slot (used by reports for urgent/type/category/status),
  large title, meta line (date, author or place), divider, body, optional footer slot (report
  status actions now; reactions and comments in piece 2). `PostCard` and the report card are
  rebuilt on it; the info cards keep their own shape.
- Pinned announcements show a "Przypięte do {date}" badge and a subtle primary-tinted border.
- Author line: "Ogłoszenie zarządu" for announcements without an author or by staff; the
  (masked) author name for neighbor posts.
- Empty states: existing bulletin illustration; neighbor filter has its own hint ("Napisz do
  sąsiadów…").

All strings in `messages/pl.json` and `messages/en.json`.

## Testing

Domain tests against the local test DB:

- community scoping for list and get-by-slug (other community's post invisible / 404)
- resident can create NEIGHBOR, cannot create ANNOUNCEMENT; staff can create both
- pinned ordering: active pin first, expired pin falls into chronological order, neighbor
  posts ignore `pinnedUntil`
- edit/delete rules (author, staff, other resident denied)
- announcement creates one notification per member; neighbor post creates none
- author masking for `shareName = false`

## Out of scope

Reactions and comments (piece 2), neighbor-post categories, abuse reporting, showing public
reports inside Tablica, changing report types.
