# Join Requests and Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People on the waiting screen can request access (building, apartment, owner/tenant, note) that managers/admins (and reception when allowed) approve or reject in a new "Prośby" admin tab; "Dodaj członka" also emails an invitation.

**Architecture:** A `JoinRequest` table plus a community flag; `domain/join-requests` owns create/cancel/list/approve/reject with permission checks, audit and notifications; approval creates the membership and residency in one transaction. A small `lib/email.ts` sends transactional mail (invites, decisions) through the existing Resend setup. The waiting screen becomes a server wrapper with a client form; the admin area gets a "Prośby" tab.

**Tech Stack:** Next.js 15, Prisma 6 + Postgres, next-intl, zod, vitest, Resend HTTP API, Clerk `<SignUp>`.

Spec: `docs/superpowers/specs/2026-11-12-join-requests-invitations-design.md`

## Global Constraints

- Approvers: MANAGER and ADMIN always; RECEPTIONIST only when `Community.receptionCanApproveJoinRequests` is true. Only MANAGER/ADMIN change that flag.
- At most one PENDING request per user per community (domain check + partial unique index).
- Approval creates `Membership { role: RESIDENT, buildingId }` + `ApartmentResidency { kind }` atomically and marks the request APPROVED; if the user already has a membership in that community, approval fails with ValidationError and the request stays PENDING.
- Note and reject reason ≤ 500 characters (trimmed).
- Notifications: `JOIN_REQUEST_CREATED` → every approver (normal preferences); `JOIN_REQUEST_APPROVED` / `JOIN_REQUEST_REJECTED` → requester in-app, plus a transactional email regardless of preferences.
- Invite email: sent when "Dodaj członka" targets a pending placeholder user (`clerkUserId` starts with `pending:`); resend at most once per 10 minutes; email failure never fails membership creation.
- Sign-up link: `${APP_URL}/sign-up?email=<urlencoded>`; the sign-up page pre-fills Clerk's email field.
- The Clerk-API listing (`UnassignedClerkUsers`, `domain/memberships/unassigned.ts`) is removed; "Zarejestrowani bez prośby" comes from our DB (users with no membership and no PENDING request, newest first, max 50).
- All strings in pl and en.
- **Tests wipe the database.** Vitest and `prisma migrate dev` only against local Docker Postgres (`.env` → `localhost:5432`). Never `.env.gcp` / `*:gcp`. Tests never call Resend: mock `@/lib/email`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, migration `<ts>_join_requests` | JoinRequest, enum, flags |
| `domain/__test-helpers__/fixtures.ts` | cleanup order |
| `lib/email.ts` (+ test) | `sendEmail()` via Resend |
| `domain/notifications/channels/email.ts` | uses `sendEmail` |
| `domain/notifications/types.ts`, `domain/audit/log.ts`, messages | types, actions, texts |
| `domain/join-requests/index.ts` (+ `index.test.ts`) | requests domain |
| `domain/join-requests/emails.ts` | decision + invite email content |
| `domain/memberships/invites.ts` (+ test) | `sendInvite`, `isPendingUser` |
| `actions/join-requests.ts`, `actions/memberships.ts` | server actions |
| `components/system/WaitingScreen.tsx` + `components/system/JoinRequestForm.tsx` | waiting screen |
| `app/admin/requests/page.tsx`, `components/admin/JoinRequestList.tsx`, `components/admin/ReceptionApprovalSwitch.tsx` | Prośby tab |
| `app/admin/layout.tsx`, `components/admin/AdminTabs.tsx` | tab gating |
| `app/admin/users/page.tsx`, `components/admin/MembershipsTable.tsx`, `components/admin/CreateMembershipForm.tsx`, `domain/memberships/index.ts` | pending badge, resend, prefill |
| `app/sign-up/[[...sign-up]]/page.tsx` | email prefill |
| `components/notifications/NotificationBell.tsx` | links |

---

### Task 1: Schema, migration, `sendEmail`

**Files:** `prisma/schema.prisma`, new migration, `domain/__test-helpers__/fixtures.ts`, create `lib/email.ts` + `lib/email.test.ts`, modify `domain/notifications/channels/email.ts`

**Interfaces:**
- Produces: Prisma `JoinRequest`, `JoinRequestStatus`; `Community.receptionCanApproveJoinRequests: boolean`; `Membership.inviteSentAt: Date | null`.
- Produces: `sendEmail(input: { to: string; subject: string; text: string }): Promise<{ ok: true } | { ok: false; error: string; retry: boolean }>` in `lib/email.ts`.

- [ ] **Step 1: Verify local DB** (`grep '^DATABASE_URL' .env` shows localhost:5432; `docker ps | grep quattro-postgres-1`).

- [ ] **Step 2: Schema.** Add:

```prisma
enum JoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

model JoinRequest {
  id           String            @id @default(cuid())
  userId       String
  communityId  String
  buildingId   String
  apartmentId  String
  kind         ResidencyKind
  note         String?
  status       JoinRequestStatus @default(PENDING)
  decidedById  String?
  decidedAt    DateTime?
  rejectReason String?
  createdAt    DateTime          @default(now())

  user      User      @relation("JoinRequestUser", fields: [userId], references: [id], onDelete: Cascade)
  decidedBy User?     @relation("JoinRequestDecidedBy", fields: [decidedById], references: [id], onDelete: SetNull)
  community Community @relation(fields: [communityId], references: [id])
  building  Building  @relation(fields: [buildingId], references: [id])
  apartment Apartment @relation(fields: [apartmentId], references: [id])

  @@index([communityId, status, createdAt])
  @@index([userId])
}
```

Back-relations: `User`: `joinRequests JoinRequest[] @relation("JoinRequestUser")`, `decidedJoinRequests JoinRequest[] @relation("JoinRequestDecidedBy")`; `Community`, `Building`, `Apartment`: `joinRequests JoinRequest[]`. Add `receptionCanApproveJoinRequests Boolean @default(false)` to `Community` and `inviteSentAt DateTime?` to `Membership`.

- [ ] **Step 3: Migration.** `npx prisma migrate dev --create-only --name join_requests`, append:

```sql
-- One open request per user and community.
CREATE UNIQUE INDEX "JoinRequest_one_pending" ON "JoinRequest"("userId", "communityId") WHERE status = 'PENDING';
```

Apply with `npx prisma migrate dev`. If it proposes a reset, stop and report.

- [ ] **Step 4: Cleanup order.** In `cleanupDatabase` add `await prisma.joinRequest.deleteMany();` as the first line.

- [ ] **Step 5: Failing test** `lib/email.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";

const env = { ...process.env };
beforeEach(() => {
  process.env.RESEND_API_KEY = "k";
  process.env.EMAIL_FROM = "Quattro <noreply@example.com>";
});
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("posts to Resend and reports ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail({ to: "a@b.pl", subject: "S", text: "T" })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body)).toEqual({ from: "Quattro <noreply@example.com>", to: ["a@b.pl"], subject: "S", text: "T" });
  });

  it("fails without configuration and marks 5xx as retryable", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail({ to: "a@b.pl", subject: "S", text: "T" })).toMatchObject({ ok: false, retry: false });
    process.env.RESEND_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));
    expect(await sendEmail({ to: "a@b.pl", subject: "S", text: "T" })).toMatchObject({ ok: false, retry: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })));
    expect(await sendEmail({ to: "a@b.pl", subject: "S", text: "T" })).toMatchObject({ ok: false, retry: false });
  });
});
```

Run `npx vitest run lib/email.test.ts` → FAIL.

- [ ] **Step 6: Implement `lib/email.ts`:**

```ts
// Transactional email through Resend (same provider as notification emails).
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string; retry: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, error: "RESEND_API_KEY / EMAIL_FROM not set", retry: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Resend ${res.status}: ${await res.text()}`, retry: res.status >= 500 || res.status === 429 };
  } catch (error) {
    return { ok: false, error: String(error), retry: true };
  }
}
```

Then make `domain/notifications/channels/email.ts` use it, keeping its behaviour (preference check, `APP_URL` check, rendering): replace the `toResult(() => fetch(...))` with

```ts
    const res = await sendEmail({ to: user.email, subject: title, text: `${body}\n\n${footer}` });
    if (res.ok) return { status: "ok" };
    return { status: res.retry ? "retry" : "fail", error: res.error };
```

Read `./http` (`toResult`) and the channel's existing tests first: if the existing tests assert exact `SendResult` shapes or retry rules that differ (e.g. 429 handling), keep `toResult` semantics instead and only extract the shared request builder. Existing `domain/notifications/channels/email.test.ts` must stay green.

- [ ] **Step 7:** `npx vitest run lib domain/notifications` pass, `npx tsc --noEmit` clean. Commit `feat: join request table and a shared transactional email sender`.

---

### Task 2: Join request domain — create, cancel, list, setting, notifications

**Files:** create `domain/join-requests/index.ts`, `domain/join-requests/index.test.ts`; modify `domain/notifications/types.ts`, `domain/audit/log.ts`, messages

**Interfaces:**
- Produces (exact names):
  - `canDecideJoinRequests(membership: Pick<Membership, "role">, community: Pick<Community, "receptionCanApproveJoinRequests">): boolean`
  - `approverIds(tx, communityId): Promise<string[]>`
  - `getJoinOptions(actor): Promise<JoinOptions>` where `JoinOptions = { communities: { id: string; name: string; buildings: { id: string; name: string; apartments: { id: string; number: string }[] }[] }[]; requests: { id: string; communityId: string; status: JoinRequestStatus; buildingName: string; apartmentNumber: string; kind: ResidencyKind; createdAt: Date; rejectReason: string | null }[] }` (latest request per community)
  - `createJoinRequest(actor, input: { communityId: string; buildingId: string; apartmentId: string; kind: ResidencyKind; note?: string }): Promise<JoinRequest>`
  - `cancelJoinRequest(actor, requestId: string): Promise<void>`
  - `listJoinRequests(actor, communityId): Promise<{ pending: JoinRequestView[]; decided: JoinRequestView[] }>`, `JoinRequestView = { id; status; createdAt; decidedAt; note; rejectReason; kind; user: { email; name: string | null }; building: { id; name }; apartment: { id; number } }`
  - `listUsersWithoutRequest(actor, communityId): Promise<{ id: string; email: string; createdAt: Date }[]>`
  - `setReceptionCanApprove(actor, communityId, value: boolean): Promise<void>`
  - `requireApprover(actor, communityId): Promise<void>` (throws UnauthorizedError)
  - Notification types `JOIN_REQUEST_CREATED { requestId, name, buildingName, apartmentNumber }`, `JOIN_REQUEST_APPROVED { requestId, communityName }`, `JOIN_REQUEST_REJECTED { requestId, communityName, reason }` (reason "" when none).
  - Audit actions `JOIN_REQUEST_CREATED`, `JOIN_REQUEST_APPROVED`, `JOIN_REQUEST_REJECTED`, `MEMBERSHIP_INVITE_SENT`.

- [ ] **Step 1: Types, audit, texts.** Add to `AuditAction` the four actions above. In `domain/notifications/types.ts`:

```ts
const joinCreatedPayload = z.object({
  requestId: z.string(),
  name: z.string(),
  buildingName: z.string(),
  apartmentNumber: z.string(),
});
const joinDecisionPayload = z.object({ requestId: z.string(), communityName: z.string() });
// entries:
JOIN_REQUEST_CREATED: joinCreatedPayload,
JOIN_REQUEST_APPROVED: joinDecisionPayload,
JOIN_REQUEST_REJECTED: joinDecisionPayload.extend({ reason: z.string() }),
```

Texts in `notifications.types` (json round-trip script, additions only):
- pl: `JOIN_REQUEST_CREATED` `{ "title": "Nowa prośba o dostęp", "body": "{name} · {buildingName} / {apartmentNumber}" }`; `JOIN_REQUEST_APPROVED` `{ "title": "Dostęp przyznany", "body": "Witamy w {communityName}!" }`; `JOIN_REQUEST_REJECTED` `{ "title": "Prośba odrzucona", "body": "{communityName}: {reason}" }`
- en: `"New access request"` / `"{name} · {buildingName} / {apartmentNumber}"`; `"Access granted"` / `"Welcome to {communityName}!"`; `"Request declined"` / `"{communityName}: {reason}"`

- [ ] **Step 2: Failing tests** `domain/join-requests/index.test.ts` (fixtures: `createCommunityWithBuildingAndApartment`, `createUserWithMembership`, `cleanupDatabase`; plus a helper that creates a user with no membership):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import {
  cancelJoinRequest,
  createJoinRequest,
  getJoinOptions,
  listJoinRequests,
  listUsersWithoutRequest,
  setReceptionCanApprove,
} from "@/domain/join-requests";

afterEach(async () => {
  await cleanupDatabase();
});

async function newcomer(email = `new-${Date.now()}-${Math.random()}@example.com`): Promise<SessionUser> {
  const user = await prisma.user.create({ data: { email, clerkUserId: `clerk_${email}` } });
  return { ...user, memberships: [], residencies: [] };
}

async function setup() {
  const base = await createCommunityWithBuildingAndApartment();
  const manager = await createUserWithMembership({ communityId: base.community.id, role: Role.MANAGER });
  const reception = await createUserWithMembership({ communityId: base.community.id, role: Role.RECEPTIONIST });
  const resident = await createUserWithMembership({
    communityId: base.community.id,
    buildingId: base.building.id,
    apartmentId: base.apartment.id,
    role: Role.RESIDENT,
  });
  const input = { communityId: base.community.id, buildingId: base.building.id, apartmentId: base.apartment.id, kind: "OWNER" as const };
  return { ...base, manager, reception, resident, input };
}

describe("createJoinRequest", () => {
  it("creates a pending request and notifies managers/admins only (reception when allowed)", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, { ...s.input, note: "  kupiłam w październiku  " });
    expect(req.status).toBe("PENDING");
    expect(req.note).toBe("kupiłam w październiku");
    let recipients = (await prisma.notification.findMany({ where: { type: "JOIN_REQUEST_CREATED" } })).map((n) => n.recipientUserId);
    expect(recipients).toEqual([s.manager.id]);

    await setReceptionCanApprove(s.manager, s.community.id, true);
    await cancelJoinRequest(me, req.id);
    await createJoinRequest(me, s.input);
    recipients = (await prisma.notification.findMany({ where: { type: "JOIN_REQUEST_CREATED" } })).map((n) => n.recipientUserId).sort();
    expect(recipients).toEqual([s.manager.id, s.manager.id, s.reception.id].sort());
  });

  it("rejects a second pending request, a member, a too long note and mismatched apartments", async () => {
    const s = await setup();
    const me = await newcomer();
    await createJoinRequest(me, s.input);
    await expect(createJoinRequest(me, s.input)).rejects.toThrow(ValidationError);
    await expect(createJoinRequest(s.resident, s.input)).rejects.toThrow(ValidationError);
    const other = await newcomer();
    await expect(createJoinRequest(other, { ...s.input, note: "x".repeat(501) })).rejects.toThrow(ValidationError);
    const elsewhere = await createCommunityWithBuildingAndApartment();
    await expect(createJoinRequest(other, { ...s.input, apartmentId: elsewhere.apartment.id })).rejects.toThrow();
  });
});

describe("cancelJoinRequest", () => {
  it("cancels only the requester's own pending request", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await expect(cancelJoinRequest(await newcomer(), req.id)).rejects.toThrow();
    await cancelJoinRequest(me, req.id);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
  });
});

describe("listing", () => {
  it("lists pending requests for approvers and users without a request from our DB", async () => {
    const s = await setup();
    const withRequest = await newcomer("with@example.com");
    const without = await newcomer("without@example.com");
    await createJoinRequest(withRequest, s.input);

    const { pending } = await listJoinRequests(s.manager, s.community.id);
    expect(pending.map((r) => r.user.email)).toEqual(["with@example.com"]);
    const loose = await listUsersWithoutRequest(s.manager, s.community.id);
    expect(loose.map((u) => u.email)).toContain(without.email);
    expect(loose.map((u) => u.email)).not.toContain(withRequest.email);
    expect(loose.map((u) => u.email)).not.toContain(s.resident.email);

    await expect(listJoinRequests(s.reception, s.community.id)).rejects.toThrow(UnauthorizedError);
    await expect(listJoinRequests(s.resident, s.community.id)).rejects.toThrow(UnauthorizedError);
    await setReceptionCanApprove(s.manager, s.community.id, true);
    expect((await listJoinRequests(s.reception, s.community.id)).pending).toHaveLength(1);
  });

  it("only managers/admins change the reception setting", async () => {
    const s = await setup();
    await expect(setReceptionCanApprove(s.reception, s.community.id, true)).rejects.toThrow(UnauthorizedError);
  });

  it("gives a newcomer the community's buildings/apartments and their latest request", async () => {
    const s = await setup();
    const me = await newcomer();
    let opts = await getJoinOptions(me);
    expect(opts.communities[0].buildings[0].apartments.map((a) => a.id)).toContain(s.apartment.id);
    expect(opts.requests).toEqual([]);
    await createJoinRequest(me, s.input);
    opts = await getJoinOptions(me);
    expect(opts.requests[0]).toMatchObject({ status: "PENDING", apartmentNumber: "101", kind: "OWNER" });
  });
});
```

(`createCommunityWithBuildingAndApartment` creates apartment "101" in "Building A".) Run → FAIL.

- [ ] **Step 3: Implement `domain/join-requests/index.ts`:**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, TenantMismatchError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import {
  JoinRequestStatus,
  Role,
  type Community,
  type JoinRequest,
  type Membership,
  type Prisma,
  type ResidencyKind,
} from "@/lib/generated/prisma";

const MANAGERS: Role[] = [Role.MANAGER, Role.ADMIN];
const MAX_TEXT = 500;

export function canDecideJoinRequests(
  membership: Pick<Membership, "role">,
  community: Pick<Community, "receptionCanApproveJoinRequests">,
): boolean {
  return (
    MANAGERS.includes(membership.role) ||
    (membership.role === Role.RECEPTIONIST && community.receptionCanApproveJoinRequests)
  );
}

export async function requireApprover(actor: SessionUser, communityId: string) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!membership || !community || !canDecideJoinRequests(membership, community)) {
    throw new UnauthorizedError(`User ${actor.id} cannot decide join requests in ${communityId}`);
  }
  return { membership, community };
}

export async function approverIds(tx: Prisma.TransactionClient, communityId: string): Promise<string[]> {
  const community = await tx.community.findUniqueOrThrow({ where: { id: communityId } });
  const roles = community.receptionCanApproveJoinRequests ? [...MANAGERS, Role.RECEPTIONIST] : MANAGERS;
  const members = await tx.membership.findMany({ where: { communityId, role: { in: roles } }, select: { userId: true } });
  return members.map((m) => m.userId);
}

const cleanText = (s: string | undefined | null) => {
  const t = (s ?? "").trim();
  if (t.length > MAX_TEXT) throw new ValidationError(`text longer than ${MAX_TEXT}`);
  return t || null;
};

const displayName = (u: { firstName: string | null; lastName: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || null;

export type JoinOptions = {
  communities: { id: string; name: string; buildings: { id: string; name: string; apartments: { id: string; number: string }[] }[] }[];
  requests: {
    id: string;
    communityId: string;
    status: JoinRequestStatus;
    buildingName: string;
    apartmentNumber: string;
    kind: ResidencyKind;
    createdAt: Date;
    rejectReason: string | null;
  }[];
};

// ponytail: offers every community; fine while one deployment serves one community.
export async function getJoinOptions(actor: SessionUser): Promise<JoinOptions> {
  const communities = await prisma.community.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      buildings: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, apartments: { orderBy: { number: "asc" }, select: { id: true, number: true } } },
      },
    },
  });
  const rows = await prisma.joinRequest.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    include: { building: true, apartment: true },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.communityId)) latest.set(r.communityId, r);
  return {
    communities,
    requests: [...latest.values()].map((r) => ({
      id: r.id,
      communityId: r.communityId,
      status: r.status,
      buildingName: r.building.name,
      apartmentNumber: r.apartment.number,
      kind: r.kind,
      createdAt: r.createdAt,
      rejectReason: r.rejectReason,
    })),
  };
}

export async function createJoinRequest(
  actor: SessionUser,
  input: { communityId: string; buildingId: string; apartmentId: string; kind: ResidencyKind; note?: string },
): Promise<JoinRequest> {
  if (actor.memberships.some((m) => m.communityId === input.communityId)) {
    throw new ValidationError("already a member of this community");
  }
  const note = cleanText(input.note);
  const apartment = await prisma.apartment.findUnique({ where: { id: input.apartmentId }, include: { building: true } });
  if (!apartment || apartment.buildingId !== input.buildingId || apartment.building.communityId !== input.communityId) {
    throw new TenantMismatchError(`Apartment ${input.apartmentId} is not in building ${input.buildingId}`);
  }
  return prisma.$transaction(async (tx) => {
    const open = await tx.joinRequest.findFirst({ where: { userId: actor.id, communityId: input.communityId, status: JoinRequestStatus.PENDING } });
    if (open) throw new ValidationError("a pending request already exists");
    const request = await tx.joinRequest.create({
      data: { userId: actor.id, communityId: input.communityId, buildingId: input.buildingId, apartmentId: input.apartmentId, kind: input.kind, note },
    });
    await writeAuditLog(tx, {
      communityId: input.communityId,
      userId: actor.id,
      action: "JOIN_REQUEST_CREATED",
      entity: "JoinRequest",
      entityId: request.id,
    });
    await notify(tx, {
      communityId: input.communityId,
      type: "JOIN_REQUEST_CREATED",
      recipientUserIds: await approverIds(tx, input.communityId),
      payload: {
        requestId: request.id,
        name: displayName(actor) ?? actor.email,
        buildingName: apartment.building.name,
        apartmentNumber: apartment.number,
      },
      dedupeKey: `JOIN_REQUEST_CREATED:${request.id}`,
    });
    return request;
  });
}

export async function cancelJoinRequest(actor: SessionUser, requestId: string): Promise<void> {
  const res = await prisma.joinRequest.updateMany({
    where: { id: requestId, userId: actor.id, status: JoinRequestStatus.PENDING },
    data: { status: JoinRequestStatus.CANCELLED },
  });
  if (res.count === 0) throw new NotFoundError(`Pending request ${requestId} not found`);
}

const viewInclude = {
  user: { select: { email: true, firstName: true, lastName: true } },
  building: { select: { id: true, name: true } },
  apartment: { select: { id: true, number: true } },
} satisfies Prisma.JoinRequestInclude;

export type JoinRequestView = {
  id: string;
  status: JoinRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
  note: string | null;
  rejectReason: string | null;
  kind: ResidencyKind;
  user: { email: string; name: string | null };
  building: { id: string; name: string };
  apartment: { id: string; number: string };
};

const toView = (r: Prisma.JoinRequestGetPayload<{ include: typeof viewInclude }>): JoinRequestView => ({
  id: r.id,
  status: r.status,
  createdAt: r.createdAt,
  decidedAt: r.decidedAt,
  note: r.note,
  rejectReason: r.rejectReason,
  kind: r.kind,
  user: { email: r.user.email, name: displayName(r.user) },
  building: r.building,
  apartment: r.apartment,
});

export async function listJoinRequests(actor: SessionUser, communityId: string) {
  await requireApprover(actor, communityId);
  const [pending, decided] = await Promise.all([
    prisma.joinRequest.findMany({ where: { communityId, status: JoinRequestStatus.PENDING }, include: viewInclude, orderBy: { createdAt: "asc" } }),
    prisma.joinRequest.findMany({
      where: { communityId, status: { in: [JoinRequestStatus.APPROVED, JoinRequestStatus.REJECTED] } },
      include: viewInclude,
      orderBy: { decidedAt: "desc" },
      take: 20,
    }),
  ]);
  return { pending: pending.map(toView), decided: decided.map(toView) };
}

export async function listUsersWithoutRequest(actor: SessionUser, communityId: string) {
  await requireApprover(actor, communityId);
  return prisma.user.findMany({
    where: {
      memberships: { none: {} },
      joinRequests: { none: { status: JoinRequestStatus.PENDING } },
      NOT: { clerkUserId: { startsWith: "pending:" } },
    },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function setReceptionCanApprove(actor: SessionUser, communityId: string, value: boolean) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  if (!membership || !MANAGERS.includes(membership.role)) {
    throw new UnauthorizedError(`User ${actor.id} cannot change community settings`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { receptionCanApproveJoinRequests: value } });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "COMMUNITY_SETTINGS_CHANGED",
      entity: "Community",
      entityId: communityId,
      metadata: { receptionCanApproveJoinRequests: value },
    });
  });
}
```

If `Prisma.JoinRequestInclude`/`GetPayload` names or the `User` fields differ, adapt minimally and record it.

- [ ] **Step 4:** `npx vitest run domain/join-requests` PASS, `npx tsc --noEmit` clean. Commit `feat: join requests domain with approver rules and notifications`.

---

### Task 3: Approve and reject, decision emails

**Files:** modify `domain/join-requests/index.ts`, `domain/join-requests/index.test.ts`; create `domain/join-requests/emails.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: `approveJoinRequest(actor, requestId, overrides?: { buildingId: string; apartmentId: string; kind: ResidencyKind }): Promise<void>`, `rejectJoinRequest(actor, requestId, reason?: string): Promise<void>`; `decisionEmail(locale, input): { subject; text }` and `inviteEmail(locale, input)` in `emails.ts` (Task 4 uses `inviteEmail`).

- [ ] **Step 1: Failing tests** (append; `sendEmail` mocked at the top of the file):

```ts
import { sendEmail } from "@/lib/email";
import { approveJoinRequest, rejectJoinRequest } from "@/domain/join-requests";

describe("approve / reject", () => {
  it("approves into a resident membership + residency atomically and tells the requester", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, { ...s.input, kind: "TENANT" });
    await approveJoinRequest(s.manager, req.id);

    const membership = await prisma.membership.findUniqueOrThrow({ where: { userId_communityId: { userId: me.id, communityId: s.community.id } } });
    expect(membership).toMatchObject({ role: "RESIDENT", buildingId: s.building.id });
    const residency = await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: me.id } });
    expect(residency).toMatchObject({ apartmentId: s.apartment.id, kind: "TENANT" });
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
    expect(await prisma.notification.count({ where: { type: "JOIN_REQUEST_APPROVED", recipientUserId: me.id } })).toBe(1);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ to: me.email }));
  });

  it("applies overrides from 'edit and approve'", async () => {
    const s = await setup();
    const other = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "102" } });
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await approveJoinRequest(s.manager, req.id, { buildingId: s.building.id, apartmentId: other.id, kind: "TENANT" });
    expect(await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: me.id } })).toMatchObject({ apartmentId: other.id, kind: "TENANT" });
  });

  it("enforces who may decide", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await expect(approveJoinRequest(s.reception, req.id)).rejects.toThrow(UnauthorizedError);
    await expect(approveJoinRequest(s.resident, req.id)).rejects.toThrow(UnauthorizedError);
    const elsewhere = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: elsewhere.community.id, role: Role.MANAGER });
    await expect(approveJoinRequest(outsider, req.id)).rejects.toThrow();
    await setReceptionCanApprove(s.manager, s.community.id, true);
    await rejectJoinRequest(s.reception, req.id, "  nie znamy tej osoby ");
    const stored = await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(stored).toMatchObject({ status: "REJECTED", rejectReason: "nie znamy tej osoby", decidedById: s.reception.id });
    expect(await prisma.notification.count({ where: { type: "JOIN_REQUEST_REJECTED", recipientUserId: me.id } })).toBe(1);
  });

  it("leaves the request pending when the user became a member meanwhile", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await prisma.membership.create({ data: { userId: me.id, communityId: s.community.id, role: Role.RESIDENT } });
    await expect(approveJoinRequest(s.manager, req.id)).rejects.toThrow(ValidationError);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
  });

  it("does not fail the decision when the email fails", async () => {
    const s = await setup();
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, error: "down", retry: true });
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await approveJoinRequest(s.manager, req.id);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
  });
});
```

Run → FAIL.

- [ ] **Step 2: `domain/join-requests/emails.ts`** (pure; locale via the recipient's `User.locale` resolved with `resolveLocale` from `@/i18n/locale`, like `render.ts`):

```ts
import { createTranslator } from "next-intl";
import { resolveLocale } from "@/i18n/locale";
import en from "@/messages/en.json";
import pl from "@/messages/pl.json";

const catalogs = { en, pl };
const appUrl = () => (process.env.APP_URL ?? "").replace(/\/+$/, "");

function tr(userLocale: string | null | undefined) {
  const locale = resolveLocale({ userLocale });
  return createTranslator({ locale, messages: catalogs[locale], namespace: "emails" });
}

export function decisionEmail(
  userLocale: string | null | undefined,
  input: { approved: boolean; communityName: string; reason?: string | null },
) {
  const t = tr(userLocale);
  const key = input.approved ? "approved" : "rejected";
  return {
    subject: t(`${key}.subject` as never, { communityName: input.communityName } as never),
    text: t(`${key}.text` as never, { communityName: input.communityName, reason: input.reason ?? "", url: appUrl() } as never),
  };
}

export function inviteEmail(
  userLocale: string | null | undefined,
  input: { email: string; communityName: string; place: string },
) {
  const t = tr(userLocale);
  const url = `${appUrl()}/sign-up?email=${encodeURIComponent(input.email)}`;
  return {
    subject: t("invite.subject" as never, { communityName: input.communityName } as never),
    text: t("invite.text" as never, { communityName: input.communityName, place: input.place, url } as never),
  };
}
```

Add `emails` strings (pl/en, json round-trip, additions only):
- pl: `approved.subject` "Masz dostęp do {communityName}", `approved.text` "Zarząd zatwierdził Twoją prośbę. Zaloguj się: {url}"; `rejected.subject` "Prośba o dostęp do {communityName}", `rejected.text` "Zarząd odrzucił prośbę. {reason}\n\nMożesz wysłać nową prośbę: {url}"; `invite.subject` "Zaproszenie do Quattro – {communityName}", `invite.text` "Zarząd zaprasza Cię do aplikacji osiedla {communityName}.\n{place}\n\nZałóż konto: {url}"
- en: "You now have access to {communityName}" / "The management approved your request. Sign in: {url}"; "Your request to join {communityName}" / "The management declined your request. {reason}\n\nYou can send a new request: {url}"; "Invitation to Quattro – {communityName}" / "The management invites you to the {communityName} app.\n{place}\n\nCreate your account: {url}"

Check `resolveLocale`'s signature in `i18n/locale.ts` and adapt the call if needed.

- [ ] **Step 3: Implement approve/reject** in `domain/join-requests/index.ts` (add imports `sendEmail` from `@/lib/email`, `decisionEmail` from `./emails`):

```ts
async function loadPending(requestId: string) {
  const req = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: { user: true, community: true },
  });
  if (!req) throw new NotFoundError(`Join request ${requestId} not found`);
  return req;
}

async function emailDecision(user: { email: string; locale: string | null }, approved: boolean, communityName: string, reason?: string | null) {
  const mail = decisionEmail(user.locale, { approved, communityName, reason });
  const res = await sendEmail({ to: user.email, ...mail });
  if (!res.ok) console.error("join request decision email failed", res.error);
}

export async function approveJoinRequest(
  actor: SessionUser,
  requestId: string,
  overrides?: { buildingId: string; apartmentId: string; kind: ResidencyKind },
): Promise<void> {
  const req = await loadPending(requestId);
  await requireApprover(actor, req.communityId);
  if (req.status !== JoinRequestStatus.PENDING) throw new ValidationError("request is not pending");
  const target = overrides ?? { buildingId: req.buildingId, apartmentId: req.apartmentId, kind: req.kind };

  await prisma.$transaction(async (tx) => {
    const apartment = await tx.apartment.findUnique({ where: { id: target.apartmentId }, include: { building: true } });
    if (!apartment || apartment.buildingId !== target.buildingId || apartment.building.communityId !== req.communityId) {
      throw new TenantMismatchError(`Apartment ${target.apartmentId} is not in building ${target.buildingId}`);
    }
    const existing = await tx.membership.findUnique({ where: { userId_communityId: { userId: req.userId, communityId: req.communityId } } });
    if (existing) throw new ValidationError("user is already a member");
    await tx.membership.create({ data: { userId: req.userId, communityId: req.communityId, buildingId: target.buildingId, role: Role.RESIDENT } });
    await tx.apartmentResidency.create({
      data: { userId: req.userId, apartmentId: target.apartmentId, communityId: req.communityId, kind: target.kind },
    });
    const updated = await tx.joinRequest.updateMany({
      where: { id: req.id, status: JoinRequestStatus.PENDING },
      data: { status: JoinRequestStatus.APPROVED, decidedById: actor.id, decidedAt: new Date(), buildingId: target.buildingId, apartmentId: target.apartmentId, kind: target.kind },
    });
    if (updated.count === 0) throw new ValidationError("request is not pending");
    await writeAuditLog(tx, { communityId: req.communityId, userId: actor.id, action: "JOIN_REQUEST_APPROVED", entity: "JoinRequest", entityId: req.id, metadata: target });
    await notify(tx, {
      communityId: req.communityId,
      type: "JOIN_REQUEST_APPROVED",
      recipientUserIds: [req.userId],
      payload: { requestId: req.id, communityName: req.community.name },
      dedupeKey: `JOIN_REQUEST_APPROVED:${req.id}`,
    });
  });
  await emailDecision(req.user, true, req.community.name);
}

export async function rejectJoinRequest(actor: SessionUser, requestId: string, reason?: string): Promise<void> {
  const req = await loadPending(requestId);
  await requireApprover(actor, req.communityId);
  const rejectReason = cleanText(reason);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.joinRequest.updateMany({
      where: { id: req.id, status: JoinRequestStatus.PENDING },
      data: { status: JoinRequestStatus.REJECTED, decidedById: actor.id, decidedAt: new Date(), rejectReason },
    });
    if (updated.count === 0) throw new ValidationError("request is not pending");
    await writeAuditLog(tx, { communityId: req.communityId, userId: actor.id, action: "JOIN_REQUEST_REJECTED", entity: "JoinRequest", entityId: req.id });
    await notify(tx, {
      communityId: req.communityId,
      type: "JOIN_REQUEST_REJECTED",
      recipientUserIds: [req.userId],
      payload: { requestId: req.id, communityName: req.community.name, reason: rejectReason ?? "" },
      dedupeKey: `JOIN_REQUEST_REJECTED:${req.id}`,
    });
  });
  await emailDecision(req.user, false, req.community.name, rejectReason);
}
```

Note: `requireApprover` uses the actor's membership of the request's community, so an outsider (membership elsewhere) gets UnauthorizedError — no existence leak beyond that.

- [ ] **Step 4:** `npx vitest run domain/join-requests` PASS; tsc clean. Commit `feat: approve and reject join requests with decision emails`.

---

### Task 4: Invitations

**Files:** create `domain/memberships/invites.ts`, `domain/memberships/invites.test.ts`; modify `actions/memberships.ts`, `domain/memberships/index.ts` (`listMembershipsForCommunity`), `app/sign-up/[[...sign-up]]/page.tsx`

**Interfaces:**
- Consumes: `sendEmail`, `inviteEmail`.
- Produces: `isPendingUser(user: { clerkUserId: string }): boolean`; `sendInvite(actor, membershipId: string, opts?: { auto?: boolean }): Promise<{ sent: boolean }>`; `resendInviteAction(membershipId)`; `listMembershipsForCommunity` rows gain `pending: boolean` and `inviteSentAt: Date | null` (no clerk id sent to the client).

- [ ] **Step 1: Failing tests** `domain/memberships/invites.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { sendEmail } from "@/lib/email";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import { cleanupDatabase, createCommunityWithBuildingAndApartment, createUserWithMembership } from "@/domain/__test-helpers__/fixtures";
import { createMembership } from "@/domain/memberships";
import { sendInvite } from "@/domain/memberships/invites";

afterEach(async () => {
  await cleanupDatabase();
  vi.mocked(sendEmail).mockClear();
});

describe("sendInvite", () => {
  it("emails a pending placeholder, records the time and throttles resends to 10 minutes", async () => {
    const s = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const m = await createMembership(manager, { communityId: s.community.id, email: "invitee@example.com", role: Role.RESIDENT, buildingId: s.building.id });
    expect(await sendInvite(manager, m.id)).toEqual({ sent: true });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ to: "invitee@example.com" }));
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).inviteSentAt).not.toBeNull();
    await expect(sendInvite(manager, m.id)).rejects.toThrow(ValidationError);
    await prisma.membership.update({ where: { id: m.id }, data: { inviteSentAt: new Date(Date.now() - 11 * 60_000) } });
    expect(await sendInvite(manager, m.id)).toEqual({ sent: true });
  });

  it("never emails someone who already has an account, and only managers may send", async () => {
    const s = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const resident = await createUserWithMembership({ communityId: s.community.id, role: Role.RESIDENT });
    const own = await prisma.membership.findFirstOrThrow({ where: { userId: resident.id } });
    await expect(sendInvite(manager, own.id)).rejects.toThrow(ValidationError);
    await expect(sendInvite(resident, own.id)).rejects.toThrow(UnauthorizedError);
  });

  it("reports a failed email without throwing in auto mode and leaves inviteSentAt empty", async () => {
    const s = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const m = await createMembership(manager, { communityId: s.community.id, email: "x@example.com", role: Role.RESIDENT, buildingId: s.building.id });
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, error: "down", retry: true });
    expect(await sendInvite(manager, m.id, { auto: true })).toEqual({ sent: false });
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).inviteSentAt).toBeNull();
  });
});
```

(`createUserWithMembership` users have `clerkUserId: "clerk_<email>"`, i.e. not pending.) Run → FAIL.

- [ ] **Step 2: Implement `domain/memberships/invites.ts`:**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { inviteEmail } from "@/domain/join-requests/emails";
import { sendEmail } from "@/lib/email";
import { Role } from "@/lib/generated/prisma";

const RESEND_AFTER_MS = 10 * 60_000;

export const isPendingUser = (user: { clerkUserId: string }) => user.clerkUserId.startsWith("pending:");

// Sends (or resends) the invitation email to someone added by email who has no account yet.
// auto: called right after "Dodaj członka" — failures are reported, never thrown.
export async function sendInvite(actor: SessionUser, membershipId: string, opts: { auto?: boolean } = {}) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      user: { include: { residencies: { include: { apartment: { include: { building: true } } } } } },
      community: true,
    },
  });
  if (!membership) throw new NotFoundError(`Membership ${membershipId} not found`);
  const actorMembership = actor.memberships.find((m) => m.communityId === membership.communityId);
  if (!actorMembership || (actorMembership.role !== Role.MANAGER && actorMembership.role !== Role.ADMIN)) {
    throw new UnauthorizedError(`User ${actor.id} cannot send invites`);
  }
  if (!isPendingUser(membership.user)) throw new ValidationError("user already has an account");
  if (membership.inviteSentAt && Date.now() - membership.inviteSentAt.getTime() < RESEND_AFTER_MS) {
    throw new ValidationError("invite sent less than 10 minutes ago");
  }

  const residency = membership.user.residencies.find((r) => r.communityId === membership.communityId);
  const place = residency ? `${residency.apartment.building.name} / ${residency.apartment.number}` : "";
  const mail = inviteEmail(actor.locale, { email: membership.user.email, communityName: membership.community.name, place });
  const res = await sendEmail({ to: membership.user.email, ...mail });
  if (!res.ok) {
    console.error("invite email failed", res.error);
    if (opts.auto) return { sent: false };
    throw new Error(`invite email failed: ${res.error}`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membership.id }, data: { inviteSentAt: new Date() } });
    await writeAuditLog(tx, {
      communityId: membership.communityId,
      userId: actor.id,
      action: "MEMBERSHIP_INVITE_SENT",
      entity: "Membership",
      entityId: membership.id,
      metadata: { targetEmail: membership.user.email },
    });
  });
  return { sent: true };
}
```

The invite email's language follows the inviter (the invitee has no locale yet). If `User.locale` does not exist as a field, pass `null` and record it.

- [ ] **Step 3: Wire into actions.** In `actions/memberships.ts` `createMembershipAction`, after a successful create (both the resident path via `addResidency` and the `createMembership` path), find the membership by `{ userId_communityId }` for the email's user and call `await sendInvite(actor, membership.id, { auto: true })` only when that user is pending; ignore its result except logging. Add:

```ts
export async function resendInviteAction(membershipId: string): Promise<ActionState> {
  const t = await getTranslations("admin.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };
  try {
    await sendInvite(actor, membershipId);
    revalidatePath("/admin/users");
    return { message: t("inviteSent"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: te("forbidden"), success: false };
    if (error instanceof ValidationError) return { message: t("inviteTooSoon"), success: false };
    console.error(error);
    return { message: t("inviteFailed"), success: false };
  }
}
```

Strings `admin.actions.inviteSent` ("Zaproszenie wysłane" / "Invitation sent"), `inviteTooSoon` ("Zaproszenie wysłano przed chwilą — spróbuj za 10 minut" / "Invitation sent moments ago — try again in 10 minutes"), `inviteFailed` ("Nie udało się wysłać zaproszenia" / "Could not send the invitation"). Match the existing `ActionState` and translation namespace used in this file (read it first).

- [ ] **Step 4: Membership rows.** In `listMembershipsForCommunity`, add `clerkUserId: true` to the user select, and map the result so each row has `pending: isPendingUser(row.user)` and `inviteSentAt: row.inviteSentAt`, and the `user` object no longer contains `clerkUserId` (client component).

- [ ] **Step 5: Sign-up prefill.** `app/sign-up/[[...sign-up]]/page.tsx` receives `searchParams: Promise<{ email?: string }>`; pass `initialValues={{ emailAddress: email }}` to `<SignUp>` when `email` is a string of ≤ 254 chars containing "@".

- [ ] **Step 6:** `npx vitest run domain/memberships` PASS; tsc clean. Commit `feat: email invitations for members added by email`.

---

### Task 5: Waiting screen request form

**Files:** rewrite `components/system/WaitingScreen.tsx` (server), create `components/system/JoinRequestForm.tsx` (client), create `actions/join-requests.ts`, messages

**Interfaces:**
- Consumes: `getJoinOptions`, `createJoinRequest`, `cancelJoinRequest`.
- Produces: actions `createJoinRequestAction(prev, formData)` and `cancelJoinRequestAction(requestId)` returning `{ message: string; success: boolean }`; `approveJoinRequestAction(requestId, overrides?)`, `rejectJoinRequestAction(requestId, reason?)`, `setReceptionCanApproveAction(communityId, value)` (used in Task 6) in the same file.

- [ ] **Step 1: Actions file** `actions/join-requests.ts` ("use server"): each gets the user (`getCurrentUser`), validates input with zod (`communityId/buildingId/apartmentId` strings 1..64, `kind` enum OWNER|TENANT, `note`/`reason` optional ≤ 500, `overrides` optional object of the same ids + kind), calls the domain, `revalidatePath("/", "layout")` for the waiting screen actions and `revalidatePath("/admin/requests")` for decisions, `after(() => dispatchPending().catch(console.error))` after create/approve/reject, and maps errors: UnauthorizedError → `errors.forbidden`, ValidationError/TenantMismatchError → `joinRequests.errors.invalid`, NotFoundError → `joinRequests.errors.notFound`, other → `joinRequests.errors.generic` (log it). Success messages from `joinRequests.actions.{sent,cancelled,approved,rejected,settingSaved}`.

- [ ] **Step 2: Strings** under `joinRequests` (pl/en):

```
form.title "Poproś o dostęp" / "Request access"
form.community "Wspólnota" / "Community"
form.building "Budynek" / "Building"; form.buildingPlaceholder "Wybierz budynek" / "Choose a building"
form.apartment "Mieszkanie" / "Apartment"; form.apartmentPlaceholder "Wybierz mieszkanie" / "Choose an apartment"
form.kind "Jestem" / "I am"; form.owner "właścicielem" / "the owner"; form.tenant "najemcą" / "a tenant"
form.note "Wiadomość do zarządu (opcjonalnie)" / "Message to the management (optional)"
form.submit "Wyślij prośbę" / "Send request"
status.pending "Prośba wysłana {date} · czeka na zarząd" / "Request sent {date} · waiting for the management"
status.place "{building} / {apartment} · {kind}" (same in en)
status.rejected "Prośba odrzucona" / "Request declined"; status.rejectedReason "Powód: {reason}" / "Reason: {reason}"
status.cancel "Anuluj prośbę" / "Cancel request"
actions.sent "Prośba wysłana" / "Request sent"; actions.cancelled "Prośba anulowana" / "Request cancelled"
actions.approved "Prośba zatwierdzona" / "Request approved"; actions.rejected "Prośba odrzucona" / "Request declined"
actions.settingSaved "Zapisano" / "Saved"
errors.invalid "Sprawdź dane prośby" / "Check the request details"; errors.notFound "Prośba nie jest już aktualna" / "This request is no longer open"; errors.generic "Nie udało się zapisać. Spróbuj ponownie." / "Could not save. Please try again."
```

- [ ] **Step 3: Server wrapper.** `components/system/WaitingScreen.tsx` becomes an async server component (no "use client"): `const user = await getCurrentUser()`; if no user render the existing screen without the form; else `const options = await getJoinOptions(user)` and render the existing card (move the client-only parts — the `useViewer` avatar block and `SignOutButton` — into a small client component `WaitingScreenAccount` inside `JoinRequestForm.tsx` or its own file). Below the description render `<JoinRequestForm options={options} />`. Every page keeps calling `<WaitingScreen />` unchanged (it is rendered from server components; check `grep -rn "WaitingScreen" app components` that no client component renders it — if one does, render the form only where possible and record it).

- [ ] **Step 4: Client form** `components/system/JoinRequestForm.tsx` ("use client"):
  - community = the only community, or a select when `options.communities.length > 1`;
  - latest request for that community: PENDING → status line (`status.pending` with a medium date, `status.place`) + "Anuluj prośbę" button (calls `cancelJoinRequestAction`, toast); REJECTED → `status.rejected` + reason line, then the form; otherwise the form;
  - form: building select (radix Select like other forms; value "" until chosen), apartment select filtered by building (disabled until a building is chosen), radio owner/tenant (default owner), note textarea `maxLength={500}`, submit via `useActionState(createJoinRequestAction)`; hidden inputs for `communityId`, `buildingId`, `apartmentId`, `kind`; toast on result; disable submit while pending or incomplete.
  - Labels on every control; works at 375px.

- [ ] **Step 5:** tsc clean, `npx eslint components/system actions` clean. Commit `feat: request access from the waiting screen`.

---

### Task 6: "Prośby" admin tab, users list changes, bell

**Files:** create `app/admin/requests/page.tsx`, `components/admin/JoinRequestList.tsx`, `components/admin/ReceptionApprovalSwitch.tsx`; modify `app/admin/layout.tsx`, `components/admin/AdminTabs.tsx`, `app/admin/users/page.tsx`, `components/admin/MembershipsTable.tsx`, `components/admin/CreateMembershipForm.tsx`, `components/notifications/NotificationBell.tsx`; delete `components/admin/UnassignedClerkUsers.tsx`, `domain/memberships/unassigned.ts`, `domain/memberships/unassigned.test.ts`; messages

- [ ] **Step 1: Tabs and layout.** `AdminTabs` takes `tabs: ("users" | "requests" | "notifications")[]` and a `pendingCount?: number` badge for "requests" (`admin.tabs.requests` "Prośby" / "Requests"). `app/admin/layout.tsx`: load the user and the first membership's community; MANAGER/ADMIN → chrome with `["users","requests","notifications"]`; RECEPTIONIST with `receptionCanApproveJoinRequests` → chrome with `["requests"]`; otherwise children only (as now). `pendingCount` = count of PENDING requests for the community (one `prisma.joinRequest.count` — put a tiny `countPendingJoinRequests(communityId)` in the domain).

- [ ] **Step 2: Page** `app/admin/requests/page.tsx`: same guard pattern as `app/admin/notifications/page.tsx` but with `requireApprover` (UnauthorizedError → `<AccessDenied />`, no membership → `<WaitingScreen />`). Loads `listJoinRequests`, `listUsersWithoutRequest`, buildings with apartments (for "edit and approve"), and whether the viewer is MANAGER/ADMIN. Renders `<ReceptionApprovalSwitch>` (managers/admins only), `<JoinRequestList>`, then the "Zarejestrowani bez prośby" card: email, sign-up date, link button "Przypisz" → `/admin/users?invite=<urlencoded email>`.

- [ ] **Step 3: `JoinRequestList`** (client): pending cards (name or email, email, date, building / apartment, owner/tenant, note) with "Zatwierdź" (calls `approveJoinRequestAction(id)`), "Edytuj i zatwierdź" (dialog: building → apartment → kind, then `approveJoinRequestAction(id, overrides)`), "Odrzuć" (dialog with optional reason ≤ 500, `rejectJoinRequestAction`). Toasts; disable buttons while pending. Empty state with an existing illustration ("doorbell"). "Ostatnie decyzje" in a `<details>` element (status badge, who/when not needed).

- [ ] **Step 4: `ReceptionApprovalSwitch`** (client): Switch + label "Recepcja może zatwierdzać prośby" / "Reception can approve requests", calls `setReceptionCanApproveAction`, rolls back on failure with a toast.

- [ ] **Step 5: Users tab.**
  - Remove `<UnassignedClerkUsers />` and delete the two files and the test; remove `admin.unassigned*` strings from both locales (grep first).
  - `MembershipsTable`: when `row.pending`, show a badge "Oczekuje na rejestrację" / "Awaiting sign-up" and a button "Wyślij ponownie" (or "Wyślij zaproszenie" when `inviteSentAt` is null) calling `resendInviteAction(row.id)` with toast.
  - `CreateMembershipForm` takes `defaultEmail?: string` and `defaultOpen?: boolean`; `app/admin/users/page.tsx` reads `searchParams.invite` and passes both, so "Przypisz" opens the dialog with the email filled.

- [ ] **Step 6: Bell.** In `NotificationBell` `href`: `JOIN_REQUEST_CREATED` → `/admin/requests`; `JOIN_REQUEST_APPROVED` / `JOIN_REQUEST_REJECTED` → `/`.

- [ ] **Step 7:** `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (local DB). Commit `feat: requests tab, invite status in members list, Clerk listing removed`.

---

### Task 7: Verification

- [ ] **Step 1:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` (local DB only); re-seed after (`npx tsx prisma/seed.ts && npx tsx prisma/seed-test-users.ts`).
- [ ] **Step 2 (controller, browser, local dev with impersonation):**
  - `waiting` user: form → send → pending status → cancel → send again.
  - `manager`: bell "Nowa prośba o dostęp" → Prośby tab with count → edit and approve to another apartment; the waiting user now sees the app as resident of that apartment.
  - another newcomer → reject with reason → newcomer sees reason and form.
  - toggle reception switch on → `reception` sees only the "Prośby" tab and can approve; off → 403.
  - Użytkownicy: add member by email → "Oczekuje na rejestrację" + "Wyślij ponownie" (immediate resend → "spróbuj za 10 minut"). With `RESEND_API_KEY` set locally the email really goes out — use an address you own or unset the key in the dev shell.
  - "Zarejestrowani bez prośby" → "Przypisz" opens the add dialog with the email filled.
  - 375px and dark mode on the waiting screen and Prośby tab.
- [ ] **Step 3:** Report; remind that Cloud SQL needs `npm run db:migrate:gcp` before deploying, and that `APP_URL`/`EMAIL_FROM`/`RESEND_API_KEY` must be set on Vercel for invites.
