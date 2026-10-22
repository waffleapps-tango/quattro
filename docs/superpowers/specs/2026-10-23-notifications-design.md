# Notifications — Design

## Goal

Residents are notified when reception registers a package. Staff can remind residents about packages that have not been picked up, manually and automatically. The system ships with in-app notifications only, but is structured so email, SMS and other channels (web push, mobile push, Telegram, WhatsApp, Slack, webhooks) are added as a new adapter without a schema migration or refactor.

## Decisions

- **Recipients:** `Package.recipientUserId` if set, otherwise every `RESIDENT` membership of the package's apartment.
- **Triggers:** package registered (automatic), manual reminder by staff, one automatic reminder after a per-community threshold.
- **Automatic reminder:** a single reminder per package. The threshold is `Community.reminderAfterDays` (null = off), editable by staff in a settings panel.
- **Channels in v1:** in-app only. The channel layer is built now.
- **Architecture:** `Notification` + `NotificationDelivery` + channel adapters (approach B).

## Principles

- Channel is a string, not a Prisma enum. A new channel is a new adapter file, not a migration.
- A notification stores meaning (`type` + structured `payload`), not text. Each channel renders it at send time in the recipient's `User.locale`.
- Channels own their addressing. The core knows only `recipientUserId`. The email adapter reads `User.email`; a future SMS adapter reads a phone number; push channels get their own subscription table.
- Delivery is recorded separately from the notification, per channel.
- `notify()` only writes database rows. It never calls an external service, so a provider outage cannot fail a reception action.

## Data model

`Notification`
- `id`, `communityId`, `recipientUserId`, `type`, `payload Json`, `dedupeKey String?`, `readAt DateTime?`, `createdAt`
- `@@unique([recipientUserId, dedupeKey])`
- `@@index([recipientUserId, readAt, createdAt])`, `@@index([communityId])`

`NotificationDelivery`
- `id`, `notificationId`, `channel String`, `status` (`PENDING | SENT | FAILED | SKIPPED`), `attempts Int`, `lastError String?`, `sentAt DateTime?`, `nextAttemptAt DateTime?`
- `@@unique([notificationId, channel])`

`Community`
- `reminderAfterDays Int?` (null = automatic reminders off)

Deferred: `NotificationPreference (userId, channel, type, enabled)`. `resolveChannels(user, type)` is the seam; it returns all enabled channels for now.

## Channel adapters

`domain/notifications/channels/`: `{ id, send(notification, user): Promise<{ ok } | { retry } | { fail }> }`, registered in a map keyed by `id`. v1 registers only `in-app`, whose `send` is a no-op because the inbox is a query on `Notification`; its delivery is marked `SENT` at creation.

## `notify()` flow

`notify(tx, { communityId, type, recipients, payload, dedupeKey? })`, in `domain/notifications/index.ts`:

1. Runs inside the caller's transaction (same pattern as `writeAuditLog`).
2. Creates one `Notification` per recipient. A dedupe-key conflict is skipped silently.
3. Creates one `NotificationDelivery` per channel from `resolveChannels`; in-app is marked `SENT` immediately, others `PENDING`.

`dispatchPending()` selects `PENDING` deliveries whose `nextAttemptAt` is null or past, calls the adapter, and records `SENT`, `FAILED`, or a retry with backoff. v1 has nothing to dispatch; the function exists and is tested with a fake channel. It is called by the cron route so future channels need no new wiring.

## Type registry

`domain/notifications/types.ts` maps each type to its zod payload schema and its message keys in `messages/*`. Types in v1: `PACKAGE_RECEIVED`, `PACKAGE_REMINDER` (manual), `PACKAGE_REMINDER_AUTO`. A new type is one entry.

## Triggers

- **Registered:** `createPackage` calls `notify` inside its existing transaction. Dedupe key `PACKAGE_RECEIVED:<packageId>`.
- **Manual reminder:** `remindPackage(actor, packageId)`. Requires `STAFF_ROLES`, package not `PICKED_UP`, and no reminder in the last hour. Dedupe key `PACKAGE_REMINDER:<packageId>:<time bucket>` collapses double clicks. Writes audit action `PACKAGE_REMINDER_SENT`.
- **Automatic reminder:** `GET /api/cron/package-reminders`, a daily Vercel cron protected by `CRON_SECRET`. For each community with `reminderAfterDays` set, it finds packages that are not picked up, older than the threshold, and have no `PACKAGE_REMINDER_AUTO` notification, then calls `notify` with dedupe key `PACKAGE_REMINDER_AUTO:<packageId>`. The unique constraint guarantees one automatic reminder per package. A failure in one community is caught and logged, and the loop continues.
- **Picked up:** no notification in v1.

## UI

Resident:
- Bell icon with unread badge in the header, opening a popover with the latest notifications. Items link to `/packages`; unread ones are marked. Clicking an item marks it read; "Mark all read" is a server action in `actions/notifications.ts`.
- Count is fetched server-side per navigation. No polling or websockets in v1.
- Text comes from `messages/` keys in the user's locale.

Reception:
- Packages list shows "Waiting N days" for packages not picked up, and a "Remind" button per row (hidden for `PICKED_UP`). A toast reports the result, including a "reminded recently" message when the cooldown applies.
- Staff settings panel for "Auto-remind after N days" with an off toggle, writing `Community.reminderAfterDays` and logging an audit entry. MANAGER and ADMIN can edit; RECEPTIONIST can view. (Open for confirmation: whether reception should be able to edit it.)

## Permissions and tenant isolation

- Notification queries always filter by `recipientUserId = actor.id` and the active community; residents see only their own.
- Reminders reuse `requireMembership(STAFF_ROLES)` and the existing tenant checks. A case is added to `tenant-isolation.test.ts`.

## Errors

- A `notify` failure inside `createPackage` rolls the transaction back, as the audit log does. Acceptable because `notify` is only database writes.
- Cron failures are isolated per community.

## Testing

Vitest, using `domain/__test-helpers__`:
- `notify`: fan-out (named recipient vs apartment residents), dedupe, delivery rows.
- `remindPackage`: cooldown, picked-up rejection, permission checks.
- Cron job: threshold selection, and exactly one reminder on a rerun.
- `dispatchPending`: a fake channel covering success, retry and fail.

## Out of scope for v1

Email, SMS, push and other channels, the preferences UI, live updates, per-type settings, and a notification on pickup. Each has a defined seam above.
