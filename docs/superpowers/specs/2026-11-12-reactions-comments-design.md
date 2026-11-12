# Reactions and comments (piece 2 of 2)

Builds on `2026-11-12-tablica-content-model-design.md` (piece 1): posts have a community, an
author and a kind, and posts and reports render through the shared `FeedCard` with a footer
slot. This piece fills that footer.

## Decisions (agreed with user)

- Reactions: one per person per target, from five: 👍 LIKE, ❤️ LOVE, 😂 HAHA, 😮 WOW, 😢 SAD
  (no angry). Same emoji again removes it; another emoji switches.
- Comments: top-level comments plus one reply level (Facebook style).
- Notifications for both comments and reactions; reactions in-app only and aggregated.
- Storage: `Reaction` and `Comment` tables with nullable `postId` / `reportId` FKs, exactly one
  set (DB CHECK), cascade on target delete.

## Data model

```prisma
enum ReactionKind { LIKE LOVE HAHA WOW SAD }

model Reaction {
  id        String       @id @default(cuid())
  userId    String
  postId    String?
  reportId  String?
  kind      ReactionKind
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  // relations to User, Post (onDelete: Cascade), Report (onDelete: Cascade)
  @@unique([userId, postId])
  @@unique([userId, reportId])
  @@index([postId])
  @@index([reportId])
}

model Comment {
  id        String    @id @default(cuid())
  authorId  String
  postId    String?
  reportId  String?
  parentId  String?   // a top-level comment on the same target
  body      String    // 1..2000 chars after trim
  createdAt DateTime  @default(now())
  editedAt  DateTime?
  deletedAt DateTime?
  // relations to User, Post (Cascade), Report (Cascade), parent Comment (Cascade)
  @@index([postId, createdAt])
  @@index([reportId, createdAt])
  @@index([parentId])
}
```

The migration adds `CHECK (num_nonnulls("postId", "reportId") = 1)` on both tables (raw SQL in
the migration file). Postgres treats NULLs as distinct, so the two unique constraints each only
bite on their own target type.

## Domain (`domain/engagement/`)

A target is `{ type: "post" | "report"; id: string }`.

- `canSee(actor, target)`: reuses existing visibility. Posts: member of the post's community.
  Reports: PUBLIC → member of the community; PRIVATE → author or staff (`STAFF_ROLES` as in
  reports). Throws NotFoundError when not visible (no existence leak).
- `setReaction(actor, target, kind | null)`: visible targets only; PRIVATE reports reject
  reactions (ValidationError). Same kind as the existing one removes it; returns the new
  summary for that target.
- `addComment(actor, target, { body, parentId? })`: body trimmed, 1..2000 chars; `parentId`
  must be a non-deleted top-level comment on the same target (otherwise ValidationError).
- `editComment(actor, commentId, body)`: author only; sets `editedAt`.
- `deleteComment(actor, commentId)`: author or staff (MANAGER/ADMIN for posts, `STAFF_ROLES`
  for reports). Soft delete (`deletedAt`); body is never returned for deleted comments.
- `listComments(actor, target)`: top-level comments oldest first, each with its replies oldest
  first. Deleted comments without replies are omitted; with replies they appear as a
  placeholder. Authors pass through `maskPerson`.
- `engagementSummary(actor, targets[])`: for a page of targets in two grouped queries (no
  per-card queries): counts per reaction kind, total, the viewer's own reaction, comment count
  (non-deleted), and the last 2 non-deleted comments per target for the card preview.

Audit log entries for comment delete by staff (moderation). Reactions are not audited.

## Notifications

- `COMMENT_ADDED` `{ targetType, targetId, title, slug?, isReply }`: on a new comment notify
  the target's author; on a reply also notify the parent comment's author. Never the commenter
  themself; one notification per recipient per comment (dedupeKey
  `COMMENT_ADDED:<commentId>:<recipientId>`). Email/SMS follow the user's existing preferences.
- `REACTIONS_ADDED` `{ targetType, targetId, title, slug?, count }`: in-app only (never
  email/SMS). One row per recipient and target (dedupeKey `REACTIONS:<type>:<id>`); each new
  reaction by someone else updates `count`, clears `readAt` and bumps the timestamp instead of
  creating a new row. Removing a reaction does not notify.
- The notification type registry (`domain/notifications/types.ts`) gains a per-type
  `inAppOnly` flag that dispatch honours; existing types keep their behaviour.
- Texts under `notifications.types.<TYPE>` in pl/en; the bell links to the post (`/posts/<slug>`)
  or the reports page.

## UI (FeedCard footer)

- Summary row: up to 3 most-used emojis + total, and "N komentarzy" on the right (button that
  expands comments).
- Action row: "Lubię" (tap toggles 👍 or removes the current reaction; hover on desktop or
  long-press on touch opens the 5-emoji picker; shows the chosen emoji and its label when set)
  and "Komentuj" (focuses the comment box). Reactions update optimistically and roll back on
  error with a toast.
- Comments: the card shows the last 2 comments; "Pokaż wszystkie (N)" loads the full list
  inline via a server action. Each comment shows (masked) name, relative time, "(edytowano)",
  "Odpowiedz" on top-level comments, and edit/delete for permitted users. The reply box sits
  under the thread it answers.
- Private reports: no reaction row; comments visible to author and staff only, labelled as a
  private conversation.
- Accessible: buttons with labels, the picker reachable by keyboard (Enter/Space opens, arrows
  move, Escape closes), `aria-pressed` on the chosen reaction.

All strings in `messages/pl.json` and `messages/en.json`.

## Testing

Domain tests against the local test DB:

- reaction toggle, switch, removal; one reaction per user per target; both target types
- PRIVATE report: reactions rejected, comments only for author and staff, other residents get
  NotFoundError; other community's post rejected
- reply rules: reply to a top-level comment works, reply to a reply and cross-target parent
  rejected
- edit only by author; delete by author and staff; soft-delete placeholder vs omission
- `engagementSummary` counts, viewer reaction and preview for several targets at once
- notifications: comment → target author (not self), reply → also parent author; reactions →
  one in-app row per target updated in place, no email/SMS delivery rows
- author masking for `shareName = false`

## Out of scope

@mentions, images/attachments in comments, edit history, reaction analytics, notifying all
participants of a thread, comment reporting/flagging.
