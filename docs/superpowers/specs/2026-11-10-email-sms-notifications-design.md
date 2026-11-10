# Email and SMS notification channels — design

Date: 2026-11-10

## Goal

Residents can opt in to email and/or SMS for notifications (package received, reminders). In-app notifications are always on and cannot be opted out.

## Decisions

- Opt-in granularity: per channel (email, SMS), applying to every notification type.
- Defaults: both off. Existing and new users get in-app only until they opt in.
- Providers: Resend (email), SMSAPI.pl (SMS). Both via plain `fetch`, no new dependencies.
- Phone: user-entered, E.164 format check only, no OTP verification.
- Dispatch: `after(() => dispatchPending())` post-commit; the daily cron stays as the retry sweeper.

## Existing seam

`domain/notifications` already has `notify()` (writes `Notification` + one `NotificationDelivery` per channel), `channels/` adapters, and `dispatchPending()` with retry/backoff. `resolveChannels()` is the marked extension point. Only `in-app` (instant) is registered today.

## Data

New model `NotificationPreference`: `userId` (unique, FK User), `emailEnabled` (default false), `smsEnabled` (default false), `phone` (nullable, E.164). No row = both channels off. One migration.

## Channel resolution

`resolveChannels(tx, userId, type)` returns `in-app` always, plus `email` if `emailEnabled`, plus `sms` if `smsEnabled` and `phone` set. `notify()` resolves per recipient and creates `NotificationDelivery` rows only for qualifying channels (no SKIPPED rows). `type` is passed through but unused until per-type settings are wanted.

## Adapters

`channels/email.ts` (Resend; env `RESEND_API_KEY`, `EMAIL_FROM`; to `user.email`) and `channels/sms.ts` (SMSAPI; env `SMSAPI_TOKEN`, `SMSAPI_SENDER`; to saved phone). Both registered in `channels/index.ts`.

- Text is rendered from `messages/*.json` `notifications.types.<TYPE>` in the user's `locale`, so inbox, email and SMS share one copy source.
- Result mapping: 2xx → ok, 5xx / network error → retry, 4xx → fail.
- Missing env vars → `fail` with explicit error (in-app unaffected, local dev works).
- Email includes a footer link to `/settings`.

## Dispatch

`createPackage` and reminder paths call `after(() => dispatchPending())` after the transaction commits. Cron remains the sweeper for backed-off retries.

## Settings UI

The existing Notifications card on `/settings` (`components/settings/`) shows:

- In-app: switch on and disabled, hint "Always on".
- Email: switch; shows `user.email` as destination.
- SMS: switch + `type="tel"` input (`+48 …`). Enabling SMS without a valid number is rejected inline.

Each toggle saves on change with a Sonner toast, same pattern as `setShareNameAction`.

## Domain and action

`domain/notifications/preferences.ts`:

- `getPreferences(userId)` → saved values or defaults.
- `updatePreferences(actor, input)` → zod validation, upsert on `actor.id` (own row only, no role check). No audit log: `writeAuditLog` requires a `communityId` and this is personal, non-community data.

Validation: phone matches `/^\+[1-9]\d{7,14}$/` after stripping spaces/dashes (stored normalised); `smsEnabled` requires a phone; clearing the phone forces `smsEnabled=false`.

`actions/notifications.ts` gets `updateNotificationPreferencesAction` (same `ActionState` shape). Strings under `settings.notifications` in every existing locale file.

## Errors and privacy

- Provider failures never block the package flow (dispatch is post-commit); they end as `FAILED` deliveries with `lastError`.
- Phone numbers are not logged and not exposed to other users.
- Person erasure (`domain/privacy/person.ts`) must delete the user's `NotificationPreference` row; verify how it handles related tables during planning.

## Testing (vitest, domain level)

- `resolveChannels`: in-app always; email/SMS only when enabled; SMS excluded without phone.
- `notify`: opted-out user gets only in-app delivery; opted-in gets extra PENDING deliveries.
- `updatePreferences`: bad phone rejected; SMS on without phone rejected; clearing phone turns SMS off; writes only the actor's row.
- Adapters with mocked `fetch`: 2xx ok, 5xx retry, 4xx fail, missing env fail.

## Out of scope

Per-type matrix, OTP phone verification, quiet hours, one-click unsubscribe links, delivery-status UI.
