# Join requests and invitations

## Problem

A new Clerk sign-up gets a `User` row (first login via `getCurrentUser` → `linkClerkUser`, or the
Clerk `user.created` webhook) but no `Membership`, so every page shows the waiting screen
("Czekamy na zaproszenie"). Today admins discover these people through a temporary card that lists
the newest 25 Clerk users via the Clerk API (`domain/memberships/unassigned.ts`), with no
information about where they live. Admins can pre-register an email in "Dodaj członka", but nobody
tells the invited person.

## Goal

Two ways into a community:

1. **Join request (pull):** the person on the waiting screen asks for access with their building,
   apartment and relationship; an approver approves (one click), edits and approves, or rejects.
2. **Invitation (push):** "Dodaj członka" for an email without an account also emails an invite
   with a sign-up link; the first sign-in links up as today.

## Decisions (agreed with user)

- Request form: building, apartment, owner/tenant, optional note.
- Approvers: MANAGER and ADMIN; RECEPTIONIST too when the community setting
  "Recepcja może zatwierdzać prośby" is on (only MANAGER/ADMIN can change the setting).
- Requests live in a new "Prośby" tab in Administracja.
- Invite email is sent by the app through the existing Resend setup (not Clerk invitations).
- Storage: a separate `JoinRequest` table (not a pending status on Membership).

## Data model

```prisma
enum JoinRequestStatus { PENDING APPROVED REJECTED CANCELLED }

model JoinRequest {
  id           String            @id @default(cuid())
  userId       String
  communityId  String
  buildingId   String
  apartmentId  String
  kind         ResidencyKind     // OWNER | TENANT
  note         String?           // ≤ 500 chars
  status       JoinRequestStatus @default(PENDING)
  decidedById  String?
  decidedAt    DateTime?
  rejectReason String?           // ≤ 500 chars
  createdAt    DateTime          @default(now())
  // relations: user (Cascade), community, building, apartment, decidedBy (SetNull)
  @@index([communityId, status, createdAt])
  @@index([userId])
}
```

- At most one PENDING request per user per community: enforced in the domain inside the create
  transaction, plus a partial unique index in the migration SQL
  (`CREATE UNIQUE INDEX ... ON "JoinRequest"("userId","communityId") WHERE status = 'PENDING'`).
- `Community.receptionCanApproveJoinRequests Boolean @default(false)`.
- `Membership.inviteSentAt DateTime?` (last invite email for a pending, never-signed-in user).

## Domain (`domain/join-requests/`)

- `canDecideJoinRequests(membership, community)`: MANAGER/ADMIN, or RECEPTIONIST when
  `receptionCanApproveJoinRequests`.
- `getJoinOptions(actor)`: for a user without membership, the communities they can request (all
  communities; the UI shows a picker only when there is more than one) with their buildings and
  apartments, plus the user's latest request per community (to render status).
- `createJoinRequest(actor, { communityId, buildingId, apartmentId, kind, note? })`: actor must
  have no membership in that community; apartment must belong to the building and the building to
  the community; no other PENDING request (ValidationError otherwise). Notifies approvers
  (`JOIN_REQUEST_CREATED`, payload `{ requestId, name, buildingName, apartmentNumber }`, normal
  channel preferences).
- `cancelJoinRequest(actor, requestId)`: own PENDING request only.
- `listJoinRequests(actor, communityId)`: approvers only; PENDING first (oldest first), then the
  last 20 decided. Requester name/email shown in full (approvers need to identify the person).
- `listUsersWithoutRequest(actor, communityId)`: approvers only; users with no membership anywhere
  and no PENDING request, newest first, limit 50 (from our DB; replaces the Clerk listing).
- `approveJoinRequest(actor, requestId, overrides?: { buildingId, apartmentId, kind })`: approver
  only; request PENDING; in one transaction: create `Membership { role: RESIDENT, buildingId }`
  and `ApartmentResidency { kind }` (same rules as `addResidency`, incl. primary/receivesPackages
  defaults), mark APPROVED with decider and time, audit `JOIN_REQUEST_APPROVED`. If the user
  meanwhile got a membership (e.g. via invite), fail with ValidationError and leave the request
  PENDING for the approver to reject.
- `rejectJoinRequest(actor, requestId, reason?)`: approver only; PENDING → REJECTED, audit
  `JOIN_REQUEST_REJECTED`.
- `setReceptionCanApprove(actor, communityId, value)`: MANAGER/ADMIN only; audit
  `COMMUNITY_SETTINGS_CHANGED`.
- Approve/reject notify the requester (`JOIN_REQUEST_APPROVED` / `JOIN_REQUEST_REJECTED`, in-app)
  and send a transactional email regardless of their email preference (they are waiting for it
  and email is off by default).

Approvers for notifications = members of the community with MANAGER/ADMIN, plus RECEPTIONIST when
the setting is on.

## Invitations

- Extract the Resend call from `domain/notifications/channels/email.ts` into a small
  `lib/email.ts` `sendEmail({ to, subject, text, html? })` reused by the channel and by invites.
- `createMembership` (Dodaj członka): when the target user is a pending placeholder
  (`clerkUserId` starts with `pending:`), send an invite email after the transaction and set
  `inviteSentAt`. Content (pl/en by inviter's locale, community name, apartment + relationship if
  a residency was added, link `${APP_URL}/sign-up?email=<urlencoded>`).
- `resendInvite(actor, membershipId)`: MANAGER/ADMIN; pending user only; at most once per 10
  minutes (`inviteSentAt`), else ValidationError; audit `MEMBERSHIP_INVITE_SENT`.
- Sign-up page passes `?email=` to Clerk `<SignUp initialValues={{ emailAddress }}>`.
- Email failure never fails the membership creation: log it, leave `inviteSentAt` null, and the
  Użytkownicy list shows "Wyślij zaproszenie" instead of "Wyślij ponownie".

## UI

- **Waiting screen** becomes a server component wrapper (callers keep `<WaitingScreen />`) that
  loads `getJoinOptions` and renders a client form: building select → apartment select (filtered),
  owner/tenant radio, note textarea (≤ 500), "Wyślij prośbę". States: no request → form; PENDING →
  "Prośba wysłana {date} · czeka na zarząd" + "Anuluj prośbę"; REJECTED (latest) → reason + form
  again. Sign-out button stays.
- **Administracja → "Prośby (N)"** tab (N = pending count). Visible to MANAGER/ADMIN, and to
  RECEPTIONIST when the setting is on; the admin layout shows receptionists only this tab.
  - Top (MANAGER/ADMIN only): switch "Recepcja może zatwierdzać prośby".
  - Pending cards: name, email, date, building / apartment, owner/tenant, note; buttons
    "Zatwierdź", "Edytuj i zatwierdź" (dialog with building/apartment/kind), "Odrzuć" (dialog with
    optional reason).
  - "Ostatnie decyzje" (collapsed): last 20 decided.
  - "Zarejestrowani bez prośby": email, sign-up date, "Przypisz" → opens the existing
    "Dodaj członka" dialog with the email prefilled (Użytkownicy tab).
- **Użytkownicy tab**: remove `UnassignedClerkUsers`; pending placeholder members get a badge
  "Oczekuje na rejestrację" and "Wyślij ponownie" / "Wyślij zaproszenie".
- Bell: `JOIN_REQUEST_CREATED` → `/admin/requests`; approved/rejected → `/`.
- All strings pl/en.

## Removed

`components/admin/UnassignedClerkUsers.tsx`, `domain/memberships/unassigned.ts` (+ test), the
`admin.unassigned*` strings.

## Testing

Domain tests (local DB):

- create request: validation (apartment/building/community mismatch, already a member, second
  PENDING rejected), notifies approvers incl. receptionists only when the setting is on
- cancel: own PENDING only
- approve: permissions (manager, admin, receptionist on/off, resident, other community),
  creates membership + residency atomically, overrides applied, already-member case fails and
  leaves PENDING, requester notified (in-app) and transactional email attempted
- reject: permissions, reason stored, requester notified
- setting change: only MANAGER/ADMIN
- users without request: excludes members and users with a PENDING request
- invite: email sent for pending placeholder only, resend throttled to 10 minutes, email failure
  does not roll back the membership (email sender mocked)

## Out of scope

Bulk CSV invites, invite expiry, Clerk restricted sign-up mode, multi-community users choosing a
community after sign-in, self-service join codes.
