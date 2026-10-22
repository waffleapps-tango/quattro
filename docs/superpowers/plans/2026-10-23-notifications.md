# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Residents get an in-app notification when reception registers a package; staff can remind residents manually, and one automatic reminder is sent after a per-community threshold. The channel layer is built so email, SMS, push and other channels are added as adapters without a migration.

**Architecture:** `notify(tx, ...)` writes `Notification` rows (what happened, to whom) and `NotificationDelivery` rows (one per channel) inside the caller's transaction and never calls an external service. Channel adapters live in a registry; `in-app` is an instant channel (its delivery is created `SENT`, the inbox is a query on `Notification`). A `dispatchPending()` worker drains `PENDING` deliveries for future channels and is called by the daily cron route.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6 + Postgres, Clerk, next-intl (pl/en), zod, vitest, Vercel cron.

**Spec:** `docs/superpowers/specs/2026-10-23-notifications-design.md`

## Global Constraints

- Channel is a `String`, never a Prisma enum.
- A notification stores `type` + structured `payload`, not rendered text; text comes from `messages/{pl,en}.json` in the viewer's locale.
- `notify()` only writes database rows and runs inside the caller's `prisma.$transaction`.
- Recipients: `Package.recipientUserId` if set, otherwise every `RESIDENT` membership of the package's apartment.
- Manual reminder: staff roles only (`RECEPTIONIST`, `MANAGER`, `ADMIN`), package not `PICKED_UP`, cooldown 1 hour.
- Automatic reminder: exactly one per package per recipient (dedupe key `PACKAGE_REMINDER_AUTO:<packageId>`), threshold `Community.reminderAfterDays` (null = off).
- Editing `reminderAfterDays`: `MANAGER` and `ADMIN` only, through the single helper `canEditNotificationSettings(membership)`.
- Notification queries always filter by `recipientUserId = actor.id` and the community.
- Every user-facing string exists in both `messages/en.json` and `messages/pl.json` with identical keys and placeholders (enforced by `i18n/messages.test.ts`).
- Tests run against the local Postgres (`DATABASE_URL` in `.env`); `fileParallelism` is off.
- Commit message trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

Create:
- `domain/notifications/types.ts` — type registry (zod payload schema per type).
- `domain/notifications/channels/types.ts` — `ChannelAdapter`, `SendResult`.
- `domain/notifications/channels/in-app.ts` — the in-app adapter.
- `domain/notifications/channels/index.ts` — adapter registry + `resolveChannels()`.
- `domain/notifications/index.ts` — `notify()`.
- `domain/notifications/dispatch.ts` — `dispatchPending()`.
- `domain/notifications/queries.ts` — inbox queries and mark-read.
- `domain/notifications/settings.ts` — `canEditNotificationSettings`, reminder threshold read/update.
- `domain/packages/roles.ts` — shared `STAFF_ROLES`.
- `domain/packages/reminders.ts` — `resolvePackageRecipients`, `remindPackage`, `sendAutoReminders`.
- `app/api/cron/package-reminders/route.ts`, `app/api/notifications/route.ts`, `vercel.json`.
- `actions/notifications.ts`.
- `components/notifications/NotificationBell.tsx`, `components/packages/ReminderSettings.tsx`.
- Tests: `domain/notifications/{notify,dispatch,queries,settings}.test.ts`, `domain/packages/reminders.test.ts`, `app/api/cron/package-reminders/route.test.ts`.

Modify: `prisma/schema.prisma`, `domain/errors.ts`, `domain/audit/log.ts`, `domain/__test-helpers__/fixtures.ts`, `domain/packages/index.ts`, `actions/packages.ts`, `components/TopBar.tsx`, `components/packages/PackageCard.tsx`, `components/packages/PackagesList.tsx`, `app/packages/page.tsx`, `messages/en.json`, `messages/pl.json`, `.env.example`.

---

### Task 1: Schema, migration, fixtures, errors

**Files:**
- Modify: `prisma/schema.prisma`, `domain/errors.ts`, `domain/audit/log.ts`, `domain/__test-helpers__/fixtures.ts`
- Create: `prisma/migrations/<timestamp>_add_notifications/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma models `Notification`, `NotificationDelivery`, enum `DeliveryStatus`, `Community.reminderAfterDays Int?`; `RateLimitedError`; audit actions `PACKAGE_REMINDER_SENT`, `COMMUNITY_SETTINGS_CHANGED`; fixture `createPackageScenario()` returning `{ community, building, apartment, receptionist, resident }` (receptionist is `RECEPTIONIST`, resident is `RESIDENT` in `apartment`, both `SessionUser`).

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add to `model User` relations: `notifications Notification[] @relation("NotificationRecipient")`.
Add to `model Community`: field `reminderAfterDays Int?` (after `address`) and relation `notifications Notification[]`.
Append at the end of the file:

```prisma
enum DeliveryStatus {
  PENDING
  SENT
  FAILED
  SKIPPED
}

model Notification {
  id              String   @id @default(cuid())
  communityId     String
  recipientUserId String
  type            String
  payload         Json
  dedupeKey       String?
  readAt          DateTime?
  createdAt       DateTime @default(now())

  community  Community              @relation(fields: [communityId], references: [id])
  recipient  User                   @relation("NotificationRecipient", fields: [recipientUserId], references: [id])
  deliveries NotificationDelivery[]

  @@unique([recipientUserId, dedupeKey])
  @@index([recipientUserId, readAt, createdAt])
  @@index([communityId])
}

model NotificationDelivery {
  id            String         @id @default(cuid())
  notificationId String
  channel       String
  status        DeliveryStatus @default(PENDING)
  attempts      Int            @default(0)
  lastError     String?
  sentAt        DateTime?
  nextAttemptAt DateTime?
  createdAt     DateTime       @default(now())

  notification Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  @@unique([notificationId, channel])
  @@index([status, nextAttemptAt])
}
```

- [ ] **Step 2: Generate the migration and client**

Run: `npx prisma migrate dev --name add_notifications`
Expected: a new folder `prisma/migrations/*_add_notifications` and "Generated Prisma Client".

- [ ] **Step 3: Add `RateLimitedError` to `domain/errors.ts`** (append)

```ts
export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedError";
  }
}
```

- [ ] **Step 4: Extend `AuditAction` in `domain/audit/log.ts`**

Add `| "PACKAGE_REMINDER_SENT"` and `| "COMMUNITY_SETTINGS_CHANGED"` to the union.

- [ ] **Step 5: Update `domain/__test-helpers__/fixtures.ts`**

At the top of `cleanupDatabase()` add (before `auditLog.deleteMany()`):

```ts
  await prisma.notificationDelivery.deleteMany();
  await prisma.notification.deleteMany();
```

Append:

```ts
export async function createPackageScenario() {
  const { community, building, apartment } =
    await createCommunityWithBuildingAndApartment();
  const receptionist = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    role: Role.RECEPTIONIST,
  });
  const resident = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    apartmentId: apartment.id,
    role: Role.RESIDENT,
  });
  return { community, building, apartment, receptionist, resident };
}
```

- [ ] **Step 6: Verify nothing broke**

Run: `npx tsc --noEmit && npx vitest run domain`
Expected: PASS (existing tests unaffected).

- [ ] **Step 7: Commit**

```bash
git add prisma domain
git commit -m "feat: add notification tables and reminder threshold

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Notification core — types, channels, `notify()`, `dispatchPending()`

**Files:**
- Create: `domain/notifications/types.ts`, `domain/notifications/channels/types.ts`, `domain/notifications/channels/in-app.ts`, `domain/notifications/channels/index.ts`, `domain/notifications/index.ts`, `domain/notifications/dispatch.ts`
- Test: `domain/notifications/notify.test.ts`, `domain/notifications/dispatch.test.ts`

**Interfaces:**
- Consumes: Task 1 models; `createPackageScenario()`.
- Produces:
  - `NOTIFICATION_TYPES`, `NotificationType`, `NotificationPayload<T>` (from `types.ts`).
  - `ChannelAdapter { id: string; instant?: boolean; send(n: Notification, user: User): Promise<SendResult> }`, `SendResult = { status: "ok" } | { status: "retry"; error: string } | { status: "fail"; error: string }`.
  - `channels: Record<string, ChannelAdapter>`, `resolveChannels(): string[]`.
  - `notify<T extends NotificationType>(tx: Prisma.TransactionClient, params: { communityId: string; type: T; recipientUserIds: string[]; payload: NotificationPayload<T>; dedupeKey?: string }): Promise<Notification[]>` — returns only newly created notifications.
  - `dispatchPending(adapters?: Record<string, ChannelAdapter>, now?: Date): Promise<{ sent: number; retried: number; failed: number }>`, `MAX_ATTEMPTS = 5`.

- [ ] **Step 1: Write the failing `notify` test** (`domain/notifications/notify.test.ts`)

```ts
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { notify } from "@/domain/notifications";

afterEach(async () => {
  await cleanupDatabase();
});

const payload = { packageId: "p1", buildingName: "Building A", apartmentNumber: "101" };

describe("notify", () => {
  it("creates one notification and one instant SENT in-app delivery per recipient", async () => {
    const { community, resident, receptionist } = await createPackageScenario();

    const created = await prisma.$transaction((tx) =>
      notify(tx, {
        communityId: community.id,
        type: "PACKAGE_RECEIVED",
        recipientUserIds: [resident.id, receptionist.id],
        payload,
      }),
    );

    expect(created).toHaveLength(2);
    const deliveries = await prisma.notificationDelivery.findMany();
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((d) => d.channel === "in-app" && d.status === "SENT")).toBe(true);
    expect(deliveries.every((d) => d.sentAt !== null)).toBe(true);
  });

  it("skips a recipient that already has the same dedupe key", async () => {
    const { community, resident } = await createPackageScenario();
    const run = () =>
      prisma.$transaction((tx) =>
        notify(tx, {
          communityId: community.id,
          type: "PACKAGE_RECEIVED",
          recipientUserIds: [resident.id],
          payload,
          dedupeKey: "PACKAGE_RECEIVED:p1",
        }),
      );

    expect(await run()).toHaveLength(1);
    expect(await run()).toHaveLength(0);
    expect(await prisma.notification.count()).toBe(1);
  });

  it("deduplicates repeated recipient ids and returns [] for no recipients", async () => {
    const { community, resident } = await createPackageScenario();

    const created = await prisma.$transaction((tx) =>
      notify(tx, {
        communityId: community.id,
        type: "PACKAGE_RECEIVED",
        recipientUserIds: [resident.id, resident.id],
        payload,
      }),
    );
    expect(created).toHaveLength(1);

    const none = await prisma.$transaction((tx) =>
      notify(tx, {
        communityId: community.id,
        type: "PACKAGE_RECEIVED",
        recipientUserIds: [],
        payload,
      }),
    );
    expect(none).toEqual([]);
  });

  it("rejects a payload that does not match the type schema", async () => {
    const { community, resident } = await createPackageScenario();

    await expect(
      prisma.$transaction((tx) =>
        notify(tx, {
          communityId: community.id,
          type: "PACKAGE_REMINDER",
          recipientUserIds: [resident.id],
          // daysWaiting is required for reminders
          payload: payload as never,
        }),
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/notifications/notify.test.ts`
Expected: FAIL — cannot resolve `@/domain/notifications`.

- [ ] **Step 3: Implement types, channels and `notify`**

`domain/notifications/types.ts`:

```ts
import { z } from "zod";

const packagePayload = z.object({
  packageId: z.string(),
  buildingName: z.string(),
  apartmentNumber: z.string(),
});

const reminderPayload = packagePayload.extend({
  daysWaiting: z.number().int().min(0),
});

// One entry per notification type. Message text lives in messages/*.json under
// notifications.types.<TYPE>.{title,body}.
export const NOTIFICATION_TYPES = {
  PACKAGE_RECEIVED: packagePayload,
  PACKAGE_REMINDER: reminderPayload,
  PACKAGE_REMINDER_AUTO: reminderPayload,
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export type NotificationPayload<T extends NotificationType> = z.infer<
  (typeof NOTIFICATION_TYPES)[T]
>;
```

`domain/notifications/channels/types.ts`:

```ts
import type { Notification, User } from "@/lib/generated/prisma";

export type SendResult =
  | { status: "ok" }
  | { status: "retry"; error: string }
  | { status: "fail"; error: string };

export interface ChannelAdapter {
  id: string;
  // Instant channels have nothing to send: their delivery is created SENT.
  instant?: boolean;
  send(notification: Notification, user: User): Promise<SendResult>;
}
```

`domain/notifications/channels/in-app.ts`:

```ts
import type { ChannelAdapter } from "./types";

// The inbox is a query on Notification, so there is nothing to send.
export const inAppChannel: ChannelAdapter = {
  id: "in-app",
  instant: true,
  send: async () => ({ status: "ok" }),
};
```

`domain/notifications/channels/index.ts`:

```ts
import { inAppChannel } from "./in-app";
import type { ChannelAdapter } from "./types";

// Register new channels (email, sms, push, ...) here.
export const channels: Record<string, ChannelAdapter> = {
  [inAppChannel.id]: inAppChannel,
};

// ponytail: every notification goes to every registered channel. Take
// (user, type) and consult NotificationPreference here once a second channel exists.
export function resolveChannels(): string[] {
  return Object.keys(channels);
}
```

`domain/notifications/index.ts`:

```ts
import type { Prisma } from "@/lib/generated/prisma";
import { channels, resolveChannels } from "./channels";
import { NOTIFICATION_TYPES, type NotificationPayload, type NotificationType } from "./types";

export async function notify<T extends NotificationType>(
  tx: Prisma.TransactionClient,
  params: {
    communityId: string;
    type: T;
    recipientUserIds: string[];
    payload: NotificationPayload<T>;
    dedupeKey?: string;
  },
) {
  const payload = NOTIFICATION_TYPES[params.type].parse(params.payload);
  const recipientIds = [...new Set(params.recipientUserIds)];
  if (recipientIds.length === 0) return [];

  // skipDuplicates (ON CONFLICT DO NOTHING) keeps dedupe race-free without
  // aborting the surrounding transaction; only new rows are returned.
  const created = await tx.notification.createManyAndReturn({
    data: recipientIds.map((recipientUserId) => ({
      communityId: params.communityId,
      recipientUserId,
      type: params.type,
      payload: payload as Prisma.InputJsonValue,
      dedupeKey: params.dedupeKey,
    })),
    skipDuplicates: true,
  });

  const now = new Date();
  const channelIds = resolveChannels();
  await tx.notificationDelivery.createMany({
    data: created.flatMap((notification) =>
      channelIds.map((channel) => {
        const instant = channels[channel].instant === true;
        return {
          notificationId: notification.id,
          channel,
          status: instant ? ("SENT" as const) : ("PENDING" as const),
          sentAt: instant ? now : null,
        };
      }),
    ),
  });

  return created;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run domain/notifications/notify.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing `dispatchPending` test** (`domain/notifications/dispatch.test.ts`)

```ts
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { dispatchPending, MAX_ATTEMPTS } from "@/domain/notifications/dispatch";
import type { ChannelAdapter, SendResult } from "@/domain/notifications/channels/types";

afterEach(async () => {
  await cleanupDatabase();
});

async function pendingDelivery(channel = "fake", extra: { attempts?: number; nextAttemptAt?: Date } = {}) {
  const { community, resident } = await createPackageScenario();
  const notification = await prisma.notification.create({
    data: {
      communityId: community.id,
      recipientUserId: resident.id,
      type: "PACKAGE_RECEIVED",
      payload: { packageId: "p", buildingName: "B", apartmentNumber: "1" },
    },
  });
  return prisma.notificationDelivery.create({
    data: { notificationId: notification.id, channel, status: "PENDING", ...extra },
  });
}

const fake = (result: SendResult | Error): Record<string, ChannelAdapter> => ({
  fake: {
    id: "fake",
    send: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  },
});

describe("dispatchPending", () => {
  it("marks a successful delivery SENT", async () => {
    const d = await pendingDelivery();
    const result = await dispatchPending(fake({ status: "ok" }));

    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("SENT");
    expect(row.sentAt).not.toBeNull();
    expect(row.attempts).toBe(1);
  });

  it("keeps a retryable delivery PENDING with a future nextAttemptAt", async () => {
    const d = await pendingDelivery();
    const now = new Date();
    const result = await dispatchPending(fake({ status: "retry", error: "timeout" }), now);

    expect(result.retried).toBe(1);
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("PENDING");
    expect(row.lastError).toBe("timeout");
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("treats a thrown adapter error as a retry", async () => {
    const d = await pendingDelivery();
    await dispatchPending(fake(new Error("boom")));
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("PENDING");
    expect(row.lastError).toContain("boom");
  });

  it("fails a delivery after MAX_ATTEMPTS retries", async () => {
    const d = await pendingDelivery("fake", { attempts: MAX_ATTEMPTS - 1 });
    const result = await dispatchPending(fake({ status: "retry", error: "still down" }));

    expect(result.failed).toBe(1);
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("FAILED");
  });

  it("fails immediately on a permanent failure and on an unknown channel", async () => {
    const a = await pendingDelivery();
    await dispatchPending(fake({ status: "fail", error: "bad address" }));
    expect((await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("FAILED");

    await cleanupDatabase();
    const b = await pendingDelivery("nope");
    await dispatchPending(fake({ status: "ok" }));
    const row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("nope");
  });

  it("skips deliveries scheduled for later", async () => {
    const d = await pendingDelivery("fake", { nextAttemptAt: new Date(Date.now() + 60_000) });
    const result = await dispatchPending(fake({ status: "ok" }));

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect((await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("PENDING");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run domain/notifications/dispatch.test.ts`
Expected: FAIL — cannot resolve `@/domain/notifications/dispatch`.

- [ ] **Step 7: Implement `domain/notifications/dispatch.ts`**

```ts
import prisma from "@/lib/prisma";
import { channels } from "./channels";
import type { ChannelAdapter, SendResult } from "./channels/types";

export const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;

export async function dispatchPending(
  adapters: Record<string, ChannelAdapter> = channels,
  now = new Date(),
) {
  const due = await prisma.notificationDelivery.findMany({
    where: {
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    include: { notification: { include: { recipient: true } } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  const counts = { sent: 0, retried: 0, failed: 0 };

  for (const delivery of due) {
    const adapter = adapters[delivery.channel];
    const attempts = delivery.attempts + 1;
    let result: SendResult;
    if (!adapter) {
      result = { status: "fail", error: `Unknown channel ${delivery.channel}` };
    } else {
      try {
        result = await adapter.send(delivery.notification, delivery.notification.recipient);
      } catch (error) {
        result = { status: "retry", error: String(error) };
      }
    }

    if (result.status === "ok") {
      counts.sent++;
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", sentAt: now, attempts, lastError: null, nextAttemptAt: null },
      });
    } else if (result.status === "retry" && attempts < MAX_ATTEMPTS) {
      counts.retried++;
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          lastError: result.error,
          // Exponential backoff: 2, 4, 8, 16 minutes.
          nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60_000),
        },
      });
    } else {
      counts.failed++;
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attempts, lastError: result.status === "ok" ? null : result.error },
      });
    }
  }

  return counts;
}
```

- [ ] **Step 8: Run both test files and typecheck**

Run: `npx vitest run domain/notifications && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add domain/notifications
git commit -m "feat: add notify() and channel dispatcher

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Inbox queries

**Files:**
- Create: `domain/notifications/queries.ts`
- Test: `domain/notifications/queries.test.ts`

**Interfaces:**
- Consumes: `notify()`, `SessionUser`.
- Produces: `listNotifications(actor: SessionUser, communityId: string, limit?: number): Promise<Notification[]>`, `countUnread(actor, communityId): Promise<number>`, `markRead(actor, notificationId): Promise<void>`, `markAllRead(actor, communityId): Promise<void>`.

- [ ] **Step 1: Write the failing test** (`domain/notifications/queries.test.ts`)

```ts
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import {
  cleanupDatabase,
  createPackageScenario,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { notify } from "@/domain/notifications";
import { countUnread, listNotifications, markAllRead, markRead } from "@/domain/notifications/queries";

afterEach(async () => {
  await cleanupDatabase();
});

const payload = { packageId: "p1", buildingName: "A", apartmentNumber: "101" };

async function send(communityId: string, recipientUserIds: string[]) {
  return prisma.$transaction((tx) =>
    notify(tx, { communityId, type: "PACKAGE_RECEIVED", recipientUserIds, payload }),
  );
}

describe("notification queries", () => {
  it("returns only the actor's own notifications in the community", async () => {
    const { community, building, apartment, resident } = await createPackageScenario();
    const neighbour = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    await send(community.id, [resident.id]);
    await send(community.id, [neighbour.id]);

    const mine = await listNotifications(resident, community.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].recipientUserId).toBe(resident.id);
    expect(await countUnread(resident, community.id)).toBe(1);
  });

  it("does not leak notifications from another community", async () => {
    const a = await createPackageScenario();
    await send(a.community.id, [a.resident.id]);

    expect(await listNotifications(a.resident, "some-other-community")).toEqual([]);
    expect(await countUnread(a.resident, "some-other-community")).toBe(0);
  });

  it("markRead only affects the actor's notification", async () => {
    const { community, building, apartment, resident } = await createPackageScenario();
    const neighbour = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const [mine] = await send(community.id, [resident.id]);
    const [theirs] = await send(community.id, [neighbour.id]);

    await markRead(resident, theirs.id);
    expect(await countUnread(neighbour, community.id)).toBe(1);

    await markRead(resident, mine.id);
    expect(await countUnread(resident, community.id)).toBe(0);
  });

  it("markAllRead clears the actor's unread count", async () => {
    const { community, resident } = await createPackageScenario();
    await send(community.id, [resident.id]);
    await send(community.id, [resident.id]);
    expect(await countUnread(resident, community.id)).toBe(2);

    await markAllRead(resident, community.id);
    expect(await countUnread(resident, community.id)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/notifications/queries.test.ts`
Expected: FAIL — cannot resolve `@/domain/notifications/queries`.

- [ ] **Step 3: Implement `domain/notifications/queries.ts`**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";

export function listNotifications(actor: SessionUser, communityId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { recipientUserId: actor.id, communityId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export function countUnread(actor: SessionUser, communityId: string) {
  return prisma.notification.count({
    where: { recipientUserId: actor.id, communityId, readAt: null },
  });
}

export async function markRead(actor: SessionUser, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientUserId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(actor: SessionUser, communityId: string) {
  await prisma.notification.updateMany({
    where: { recipientUserId: actor.id, communityId, readAt: null },
    data: { readAt: new Date() },
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run domain/notifications/queries.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add domain/notifications
git commit -m "feat: add notification inbox queries

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Package triggers — registered, manual reminder, automatic reminder

**Files:**
- Create: `domain/packages/roles.ts`, `domain/packages/reminders.ts`
- Modify: `domain/packages/index.ts`
- Test: `domain/packages/reminders.test.ts`

**Interfaces:**
- Consumes: `notify()`, `writeAuditLog`, `requireMembership`, `RateLimitedError`, `InvalidTransitionError`, `NotFoundError`, `createPackageScenario()`.
- Produces:
  - `STAFF_ROLES: Role[]` (from `domain/packages/roles.ts`).
  - `resolvePackageRecipients(tx: Prisma.TransactionClient, pkg: { apartmentId: string; recipientUserId: string | null }): Promise<string[]>`.
  - `remindPackage(actor: SessionUser, packageId: string, now?: Date): Promise<{ notified: number }>`; throws `NotFoundError`, `UnauthorizedError`, `InvalidTransitionError` (already picked up), `RateLimitedError` (reminded within the last hour).
  - `sendAutoReminders(now?: Date): Promise<{ sent: number }>`.
  - `REMIND_COOLDOWN_MS = 3_600_000`.

- [ ] **Step 1: Write the failing test** (`domain/packages/reminders.test.ts`)

```ts
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import {
  InvalidTransitionError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
} from "@/domain/errors";
import {
  cleanupDatabase,
  createPackageScenario,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { createPackage, markPickedUp } from "@/domain/packages";
import { remindPackage, sendAutoReminders } from "@/domain/packages/reminders";

afterEach(async () => {
  await cleanupDatabase();
});

const DAY = 24 * 60 * 60 * 1000;

async function registerPackage(scenario: Awaited<ReturnType<typeof createPackageScenario>>, recipientUserId?: string) {
  return createPackage(scenario.receptionist, {
    communityId: scenario.community.id,
    buildingId: scenario.building.id,
    apartmentId: scenario.apartment.id,
    recipientUserId,
  });
}

describe("PACKAGE_RECEIVED on createPackage", () => {
  it("notifies every resident of the apartment when no recipient is set", async () => {
    const s = await createPackageScenario();
    const roommate = await createUserWithMembership({
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
      role: Role.RESIDENT,
    });

    const pkg = await registerPackage(s);

    const rows = await prisma.notification.findMany({ where: { type: "PACKAGE_RECEIVED" } });
    expect(rows.map((r) => r.recipientUserId).sort()).toEqual([s.resident.id, roommate.id].sort());
    expect(rows[0].payload).toMatchObject({ packageId: pkg.id, apartmentNumber: "101" });
  });

  it("notifies only the named recipient when one is set", async () => {
    const s = await createPackageScenario();
    await createUserWithMembership({
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
      role: Role.RESIDENT,
    });

    await registerPackage(s, s.resident.id);

    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(s.resident.id);
  });

  it("does not notify residents of other apartments or other communities", async () => {
    const s = await createPackageScenario();
    const other = await createPackageScenario();

    await registerPackage(s);

    const rows = await prisma.notification.findMany();
    expect(rows.map((r) => r.recipientUserId)).toEqual([s.resident.id]);
    expect(rows.some((r) => r.recipientUserId === other.resident.id)).toBe(false);
  });

  it("still registers the package when the apartment has no residents", async () => {
    const s = await createPackageScenario();
    await prisma.membership.delete({ where: { id: s.resident.memberships[0].id } });

    const pkg = await registerPackage(s);

    expect(pkg.status).toBe("RECEIVED");
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("remindPackage", () => {
  it("notifies the residents, writes an audit entry and reports the count", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    const now = new Date(pkg.receivedAt.getTime() + 3 * DAY);

    const result = await remindPackage(s.receptionist, pkg.id, now);

    expect(result).toEqual({ notified: 1 });
    const reminder = await prisma.notification.findFirstOrThrow({ where: { type: "PACKAGE_REMINDER" } });
    expect(reminder.recipientUserId).toBe(s.resident.id);
    expect(reminder.payload).toMatchObject({ packageId: pkg.id, daysWaiting: 3 });
    expect(
      await prisma.auditLog.count({ where: { action: "PACKAGE_REMINDER_SENT", entityId: pkg.id } }),
    ).toBe(1);
  });

  it("rejects residents", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    await expect(remindPackage(s.resident, pkg.id)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects an unknown package", async () => {
    const s = await createPackageScenario();
    await expect(remindPackage(s.receptionist, "missing")).rejects.toThrow(NotFoundError);
  });

  it("rejects a package that was already picked up", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    await markPickedUp(s.receptionist, pkg.id);
    await expect(remindPackage(s.receptionist, pkg.id)).rejects.toThrow(InvalidTransitionError);
  });

  it("rate-limits a second reminder within an hour but allows it later", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    const t0 = new Date();

    await remindPackage(s.receptionist, pkg.id, t0);
    await expect(
      remindPackage(s.receptionist, pkg.id, new Date(t0.getTime() + 10 * 60_000)),
    ).rejects.toThrow(RateLimitedError);

    // The cooldown looks at createdAt (real clock), so age the reminder instead.
    await prisma.notification.updateMany({
      where: { type: "PACKAGE_REMINDER" },
      data: { createdAt: new Date(t0.getTime() - 2 * 3_600_000) },
    });
    const later = new Date(t0.getTime() + 2 * 3_600_000);
    await expect(remindPackage(s.receptionist, pkg.id, later)).resolves.toEqual({ notified: 1 });
  });

  it("reports zero when nobody can be notified", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    await prisma.membership.delete({ where: { id: s.resident.memberships[0].id } });

    expect(await remindPackage(s.receptionist, pkg.id)).toEqual({ notified: 0 });
  });
});

describe("sendAutoReminders", () => {
  async function backdate(packageId: string, days: number) {
    await prisma.package.update({
      where: { id: packageId },
      data: { receivedAt: new Date(Date.now() - days * DAY) },
    });
  }

  it("reminds only unpicked packages older than the community threshold", async () => {
    const s = await createPackageScenario();
    await prisma.community.update({ where: { id: s.community.id }, data: { reminderAfterDays: 3 } });
    const old = await registerPackage(s);
    const fresh = await registerPackage(s);
    const picked = await registerPackage(s);
    await backdate(old.id, 4);
    await backdate(picked.id, 10);
    await markPickedUp(s.receptionist, picked.id);

    const result = await sendAutoReminders();

    expect(result).toEqual({ sent: 1 });
    const rows = await prisma.notification.findMany({ where: { type: "PACKAGE_REMINDER_AUTO" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ packageId: old.id, daysWaiting: 4 });
    expect(rows.some((r) => (r.payload as { packageId: string }).packageId === fresh.id)).toBe(false);
  });

  it("sends exactly one automatic reminder per package across reruns", async () => {
    const s = await createPackageScenario();
    await prisma.community.update({ where: { id: s.community.id }, data: { reminderAfterDays: 1 } });
    const pkg = await registerPackage(s);
    await backdate(pkg.id, 2);

    expect((await sendAutoReminders()).sent).toBe(1);
    expect((await sendAutoReminders()).sent).toBe(0);
    expect(await prisma.notification.count({ where: { type: "PACKAGE_REMINDER_AUTO" } })).toBe(1);
  });

  it("skips communities with automatic reminders off", async () => {
    const s = await createPackageScenario();
    const pkg = await registerPackage(s);
    await backdate(pkg.id, 30);

    expect(await sendAutoReminders()).toEqual({ sent: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/packages/reminders.test.ts`
Expected: FAIL — cannot resolve `@/domain/packages/reminders`.

- [ ] **Step 3: Create `domain/packages/roles.ts`**

```ts
import { Role } from "@/lib/generated/prisma";

export const STAFF_ROLES: Role[] = [Role.RECEPTIONIST, Role.MANAGER, Role.ADMIN];
```

In `domain/packages/index.ts`, replace the local `const STAFF_ROLES: Role[] = [...]` line with `import { STAFF_ROLES } from "@/domain/packages/roles";`. If `Role` is then only used as a type or unused, keep the import only if still referenced (`tsc` will tell).

- [ ] **Step 4: Create `domain/packages/reminders.ts`**

```ts
import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { InvalidTransitionError, NotFoundError, RateLimitedError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { PackageStatus, Role, type Prisma } from "@/lib/generated/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMIND_COOLDOWN_MS = 60 * 60 * 1000;

type PackageForNotice = {
  id: string;
  communityId: string;
  apartmentId: string;
  recipientUserId: string | null;
  receivedAt: Date;
  apartment: { number: string };
  building: { name: string };
};

export async function resolvePackageRecipients(
  tx: Prisma.TransactionClient,
  pkg: { apartmentId: string; recipientUserId: string | null },
): Promise<string[]> {
  if (pkg.recipientUserId) return [pkg.recipientUserId];
  const residents = await tx.membership.findMany({
    where: { apartmentId: pkg.apartmentId, role: Role.RESIDENT },
    select: { userId: true },
  });
  return residents.map((r) => r.userId);
}

function reminderPayload(pkg: PackageForNotice, now: Date) {
  return {
    packageId: pkg.id,
    buildingName: pkg.building.name,
    apartmentNumber: pkg.apartment.number,
    daysWaiting: Math.max(0, Math.floor((now.getTime() - pkg.receivedAt.getTime()) / DAY_MS)),
  };
}

export async function remindPackage(actor: SessionUser, packageId: string, now = new Date()) {
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: { apartment: true, building: true },
  });
  if (!pkg) throw new NotFoundError(`Package ${packageId} not found`);

  requireMembership(actor, pkg.communityId, STAFF_ROLES);

  if (pkg.status === PackageStatus.PICKED_UP) {
    throw new InvalidTransitionError(`Package ${packageId} was already picked up`);
  }

  return prisma.$transaction(async (tx) => {
    const recent = await tx.notification.findFirst({
      where: {
        communityId: pkg.communityId,
        type: "PACKAGE_REMINDER",
        createdAt: { gte: new Date(now.getTime() - REMIND_COOLDOWN_MS) },
        payload: { path: ["packageId"], equals: pkg.id },
      },
      select: { id: true },
    });
    if (recent) throw new RateLimitedError(`Package ${packageId} was reminded recently`);

    const recipientUserIds = await resolvePackageRecipients(tx, pkg);
    const created = await notify(tx, {
      communityId: pkg.communityId,
      type: "PACKAGE_REMINDER",
      recipientUserIds,
      payload: reminderPayload(pkg, now),
      // Race guard for double clicks; the findFirst above is the real cooldown.
      dedupeKey: `PACKAGE_REMINDER:${pkg.id}:${Math.floor(now.getTime() / REMIND_COOLDOWN_MS)}`,
    });

    await writeAuditLog(tx, {
      communityId: pkg.communityId,
      userId: actor.id,
      action: "PACKAGE_REMINDER_SENT",
      entity: "Package",
      entityId: pkg.id,
      metadata: { notified: created.length },
    });

    return { notified: created.length };
  });
}

export async function sendAutoReminders(now = new Date()) {
  const communities = await prisma.community.findMany({
    where: { reminderAfterDays: { not: null } },
    select: { id: true, reminderAfterDays: true },
  });

  let sent = 0;
  for (const community of communities) {
    try {
      const cutoff = new Date(now.getTime() - community.reminderAfterDays! * DAY_MS);
      // ponytail: rescans every overdue unpicked package on each run and relies on
      // the dedupe key to skip the ones already reminded; add a reminderSentAt
      // column on Package if the overdue set ever gets large.
      const overdue = await prisma.package.findMany({
        where: {
          communityId: community.id,
          status: { not: PackageStatus.PICKED_UP },
          receivedAt: { lte: cutoff },
        },
        include: { apartment: true, building: true },
      });

      for (const pkg of overdue) {
        await prisma.$transaction(async (tx) => {
          const created = await notify(tx, {
            communityId: community.id,
            type: "PACKAGE_REMINDER_AUTO",
            recipientUserIds: await resolvePackageRecipients(tx, pkg),
            payload: reminderPayload(pkg, now),
            dedupeKey: `PACKAGE_REMINDER_AUTO:${pkg.id}`,
          });
          sent += created.length;
        });
      }
    } catch (error) {
      console.error(`Auto reminders failed for community ${community.id}`, error);
    }
  }

  return { sent };
}
```

- [ ] **Step 5: Notify on registration in `domain/packages/index.ts`**

Add imports:

```ts
import { notify } from "@/domain/notifications";
import { resolvePackageRecipients } from "@/domain/packages/reminders";
```

In `createPackage`, after the `writeAuditLog(...)` call and before `return pkg;` add:

```ts
    await notify(tx, {
      communityId: input.communityId,
      type: "PACKAGE_RECEIVED",
      recipientUserIds: await resolvePackageRecipients(tx, pkg),
      payload: {
        packageId: pkg.id,
        buildingName: apartment.building.name,
        apartmentNumber: apartment.number,
      },
      dedupeKey: `PACKAGE_RECEIVED:${pkg.id}`,
    });
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run domain && npx tsc --noEmit`
Expected: PASS, including the pre-existing package and tenant-isolation tests.

- [ ] **Step 7: Commit**

```bash
git add domain
git commit -m "feat: notify residents on registration and add package reminders

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reminder settings (domain)

**Files:**
- Create: `domain/notifications/settings.ts`
- Test: `domain/notifications/settings.test.ts`

**Interfaces:**
- Consumes: `writeAuditLog`, `UnauthorizedError`, `ValidationError`.
- Produces: `canEditNotificationSettings(membership: Membership): boolean`, `getReminderAfterDays(communityId: string): Promise<number | null>`, `updateReminderAfterDays(actor: SessionUser, communityId: string, days: number | null): Promise<void>` (`days` must be an integer 1–60 or null).

- [ ] **Step 1: Write the failing test** (`domain/notifications/settings.test.ts`)

```ts
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createPackageScenario,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import {
  canEditNotificationSettings,
  getReminderAfterDays,
  updateReminderAfterDays,
} from "@/domain/notifications/settings";

afterEach(async () => {
  await cleanupDatabase();
});

describe("canEditNotificationSettings", () => {
  it("allows MANAGER and ADMIN only", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const check = async (role: Role) =>
      canEditNotificationSettings((await createUserWithMembership({ communityId: community.id, role })).memberships[0]);

    expect(await check(Role.MANAGER)).toBe(true);
    expect(await check(Role.ADMIN)).toBe(true);
    expect(await check(Role.RECEPTIONIST)).toBe(false);
    expect(await check(Role.RESIDENT)).toBe(false);
  });
});

describe("updateReminderAfterDays", () => {
  it("lets a manager set and clear the threshold and writes audit entries", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });

    expect(await getReminderAfterDays(community.id)).toBeNull();
    await updateReminderAfterDays(manager, community.id, 5);
    expect(await getReminderAfterDays(community.id)).toBe(5);
    await updateReminderAfterDays(manager, community.id, null);
    expect(await getReminderAfterDays(community.id)).toBeNull();

    expect(await prisma.auditLog.count({ where: { action: "COMMUNITY_SETTINGS_CHANGED" } })).toBe(2);
  });

  it("rejects reception and residents", async () => {
    const s = await createPackageScenario();
    await expect(updateReminderAfterDays(s.receptionist, s.community.id, 3)).rejects.toThrow(UnauthorizedError);
    await expect(updateReminderAfterDays(s.resident, s.community.id, 3)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a manager of a different community", async () => {
    const a = await createCommunityWithBuildingAndApartment();
    const b = await createCommunityWithBuildingAndApartment();
    const managerOfA = await createUserWithMembership({ communityId: a.community.id, role: Role.MANAGER });

    await expect(updateReminderAfterDays(managerOfA, b.community.id, 3)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects values outside 1-60 or non-integers", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: community.id, role: Role.MANAGER });

    for (const bad of [0, 61, -1, 1.5]) {
      await expect(updateReminderAfterDays(manager, community.id, bad)).rejects.toThrow(ValidationError);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/notifications/settings.test.ts`
Expected: FAIL — cannot resolve `@/domain/notifications/settings`.

- [ ] **Step 3: Implement `domain/notifications/settings.ts`**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import { Role, type Membership } from "@/lib/generated/prisma";

// Single seam for "who may change notification settings". Make this per-community
// configurable later by changing only this function.
export function canEditNotificationSettings(membership: Membership): boolean {
  return membership.role === Role.MANAGER || membership.role === Role.ADMIN;
}

export async function getReminderAfterDays(communityId: string): Promise<number | null> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { reminderAfterDays: true },
  });
  return community?.reminderAfterDays ?? null;
}

export async function updateReminderAfterDays(
  actor: SessionUser,
  communityId: string,
  days: number | null,
) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  if (!membership || !canEditNotificationSettings(membership)) {
    throw new UnauthorizedError(
      `User ${actor.id} may not edit notification settings in community ${communityId}`,
    );
  }
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 60)) {
    throw new ValidationError("reminderAfterDays must be an integer from 1 to 60");
  }

  await prisma.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { reminderAfterDays: days } });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "COMMUNITY_SETTINGS_CHANGED",
      entity: "Community",
      entityId: communityId,
      metadata: { reminderAfterDays: days },
    });
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run domain/notifications/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/notifications
git commit -m "feat: add reminder threshold settings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cron route and Vercel schedule

**Files:**
- Create: `app/api/cron/package-reminders/route.ts`, `vercel.json`
- Modify: `.env.example`
- Test: `app/api/cron/package-reminders/route.test.ts`

**Interfaces:**
- Consumes: `sendAutoReminders`, `dispatchPending`.
- Produces: `GET /api/cron/package-reminders`, protected by `Authorization: Bearer $CRON_SECRET` (Vercel sends this header for cron invocations when `CRON_SECRET` is set). Responds `{ sent, dispatched: { sent, retried, failed } }`. Fails closed (401) when `CRON_SECRET` is unset.

- [ ] **Step 1: Write the failing test** (`app/api/cron/package-reminders/route.test.ts`)

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { createPackage } from "@/domain/packages";
import { GET } from "@/app/api/cron/package-reminders/route";

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupDatabase();
});

const call = (authorization?: string) =>
  GET(
    new Request("http://localhost/api/cron/package-reminders", {
      headers: authorization ? { authorization } : {},
    }),
  );

describe("GET /api/cron/package-reminders", () => {
  it("rejects requests without the secret, and when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);

    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("sends automatic reminders when authorized", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const s = await createPackageScenario();
    await prisma.community.update({ where: { id: s.community.id }, data: { reminderAfterDays: 1 } });
    const pkg = await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });
    await prisma.package.update({
      where: { id: pkg.id },
      data: { receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });

    const res = await call("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1, dispatched: { sent: 0, retried: 0, failed: 0 } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/api/cron`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Create the route** (`app/api/cron/package-reminders/route.ts`)

```ts
import { NextResponse } from "next/server";
import { dispatchPending } from "@/domain/notifications/dispatch";
import { sendAutoReminders } from "@/domain/packages/reminders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { sent } = await sendAutoReminders();
  const dispatched = await dispatchPending();
  return NextResponse.json({ sent, dispatched });
}
```

- [ ] **Step 4: Create `vercel.json` and update `.env.example`**

`vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/package-reminders", "schedule": "0 8 * * *" }]
}
```

Append to `.env.example`:

```
# Shared secret for the Vercel cron route (set the same value in Vercel project env vars)
CRON_SECRET=
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run app/api/cron`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/cron vercel.json .env.example
git commit -m "feat: add daily package reminder cron

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Server actions and inbox API

**Files:**
- Create: `actions/notifications.ts`, `app/api/notifications/route.ts`
- Modify: `actions/packages.ts`

**Interfaces:**
- Consumes: `markRead`, `markAllRead`, `listNotifications`, `countUnread`, `updateReminderAfterDays`, `remindPackage`, error classes.
- Produces:
  - `markNotificationReadAction(id: string): Promise<void>`, `markAllNotificationsReadAction(): Promise<void>` (both resolve the community from `user.memberships[0]`, consistent with the rest of the app).
  - `updateReminderSettingsAction(prev: ActionState, formData: FormData): Promise<ActionState>` — form fields `communityId`, `enabled` (`"on"` or absent), `days`.
  - `remindPackageAction(packageId: string): Promise<ActionState>` in `actions/packages.ts`.
  - `GET /api/notifications` → `{ unread: number, items: Array<{ id, type, payload, readAt: string | null, createdAt: string }> }`.
  - Message keys used (added in Task 8): `packages.actions.reminded`, `.reminderCooldown`, `.noRecipients`, `.alreadyPickedUp`, `.settingsSaved`, `.settingsInvalid`, `.settingsNoPermission`, `.settingsFailed`.

- [ ] **Step 1: Create `app/api/notifications/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth/session";
import { countUnread, listNotifications } from "@/domain/notifications/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const membership = user?.memberships[0];
  if (!user || !membership) return NextResponse.json({ unread: 0, items: [] });

  const [unread, items] = await Promise.all([
    countUnread(user, membership.communityId),
    listNotifications(user, membership.communityId),
  ]);
  return NextResponse.json({
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      payload: n.payload,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  });
}
```

- [ ] **Step 2: Create `actions/notifications.ts`**

```ts
"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/session";
import { markAllRead, markRead } from "@/domain/notifications/queries";
import { updateReminderAfterDays } from "@/domain/notifications/settings";
import { UnauthorizedError, ValidationError } from "@/domain/errors";

type ActionState = { message: string; success: boolean };

export async function markNotificationReadAction(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markRead(user, id);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  const membership = user?.memberships[0];
  if (!user || !membership) return;
  await markAllRead(user, membership.communityId);
}

const settingsSchema = z.object({
  communityId: z.string().min(1),
  enabled: z.boolean(),
  days: z.coerce.number(),
});

export async function updateReminderSettingsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("packages.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const validated = settingsSchema.safeParse({
    communityId: formData.get("communityId"),
    enabled: formData.get("enabled") === "on",
    days: formData.get("days") || 0,
  });
  if (!validated.success) return { message: t("settingsInvalid"), success: false };

  try {
    await updateReminderAfterDays(
      actor,
      validated.data.communityId,
      validated.data.enabled ? validated.data.days : null,
    );
    revalidatePath("/packages");
    return { message: t("settingsSaved"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: t("settingsNoPermission"), success: false };
    }
    if (error instanceof ValidationError) {
      return { message: t("settingsInvalid"), success: false };
    }
    console.error(error);
    return { message: t("settingsFailed"), success: false };
  }
}
```

- [ ] **Step 3: Add `remindPackageAction` to `actions/packages.ts`**

Update the imports at the top:

```ts
import { createPackage, markPickedUp } from "@/domain/packages";
import { remindPackage } from "@/domain/packages/reminders";
import {
  InvalidTransitionError,
  NotFoundError,
  RateLimitedError,
  TenantMismatchError,
  UnauthorizedError,
} from "@/domain/errors";
```

(remove the old two import lines they replace). Append:

```ts
export async function remindPackageAction(packageId: string): Promise<ActionState> {
  const t = await getTranslations("packages.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    const { notified } = await remindPackage(actor, packageId);
    if (notified === 0) return { message: t("noRecipients"), success: false };
    return { message: t("reminded"), success: true };
  } catch (error) {
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof InvalidTransitionError) return { message: t("alreadyPickedUp"), success: false };
    if (error instanceof RateLimitedError) return { message: t("reminderCooldown"), success: false };
    console.error(error);
    return { message: t("updateFailed"), success: false };
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only about the missing `packages.actions.*` message keys (typed `Messages`); these are resolved in Task 8. No other errors.

- [ ] **Step 5: Commit**

```bash
git add actions app/api/notifications
git commit -m "feat: add notification actions and inbox endpoint

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Messages (en + pl)

**Files:**
- Modify: `messages/en.json`, `messages/pl.json`

**Interfaces:**
- Produces keys used by Tasks 7, 9, 10: `notifications.{title,empty,markAllRead,open}`, `notifications.types.{PACKAGE_RECEIVED,PACKAGE_REMINDER,PACKAGE_REMINDER_AUTO}.{title,body}`, `packages.{remind,waitingDays}`, `packages.actions.{reminded,reminderCooldown,noRecipients,alreadyPickedUp,settingsSaved,settingsInvalid,settingsNoPermission,settingsFailed}`, `packages.reminderSettings.{title,description,enabled,days,save,readOnly}`.

- [ ] **Step 1: Add the keys to `messages/en.json`**

Inside `packages` (next to `pickUp`) add:

```json
"remind": "Remind",
"waitingDays": "{count, plural, one {Waiting # day} other {Waiting # days}}",
```

Inside `packages.actions` add:

```json
"reminded": "Reminder sent",
"reminderCooldown": "A reminder was already sent recently",
"noRecipients": "No residents to notify for this apartment",
"alreadyPickedUp": "This package was already picked up",
"settingsSaved": "Reminder settings saved",
"settingsInvalid": "Enter a number of days from 1 to 60",
"settingsNoPermission": "You do not have permission to change this setting",
"settingsFailed": "Could not save the settings"
```

Inside `packages` add a new object:

```json
"reminderSettings": {
  "title": "Automatic reminder",
  "description": "Remind residents once when a package has been waiting too long.",
  "enabled": "Remind automatically",
  "days": "After (days)",
  "save": "Save",
  "readOnly": "Only managers can change this."
}
```

Add a new top-level object (sibling of `packages`):

```json
"notifications": {
  "title": "Notifications",
  "open": "Open notifications",
  "empty": "No notifications",
  "markAllRead": "Mark all as read",
  "types": {
    "PACKAGE_RECEIVED": {
      "title": "Package registered",
      "body": "A package arrived for {buildingName} / {apartmentNumber}."
    },
    "PACKAGE_REMINDER": {
      "title": "Package waiting",
      "body": "Your package for {buildingName} / {apartmentNumber} has been waiting {daysWaiting, plural, one {# day} other {# days}}."
    },
    "PACKAGE_REMINDER_AUTO": {
      "title": "Package waiting",
      "body": "Your package for {buildingName} / {apartmentNumber} has been waiting {daysWaiting, plural, one {# day} other {# days}}."
    }
  }
}
```

- [ ] **Step 2: Add the same keys to `messages/pl.json`**

`packages`:

```json
"remind": "Przypomnij",
"waitingDays": "{count, plural, one {Czeka # dzień} few {Czeka # dni} many {Czeka # dni} other {Czeka # dni}}",
```

`packages.actions`:

```json
"reminded": "Przypomnienie wysłane",
"reminderCooldown": "Przypomnienie zostało niedawno wysłane",
"noRecipients": "Brak mieszkańców do powiadomienia w tym mieszkaniu",
"alreadyPickedUp": "Ta paczka została już odebrana",
"settingsSaved": "Zapisano ustawienia przypomnień",
"settingsInvalid": "Podaj liczbę dni od 1 do 60",
"settingsNoPermission": "Nie masz uprawnień do zmiany tego ustawienia",
"settingsFailed": "Nie udało się zapisać ustawień"
```

`packages.reminderSettings`:

```json
"reminderSettings": {
  "title": "Automatyczne przypomnienie",
  "description": "Jednorazowo przypomnij mieszkańcom, gdy paczka czeka zbyt długo.",
  "enabled": "Przypominaj automatycznie",
  "days": "Po (dniach)",
  "save": "Zapisz",
  "readOnly": "Tylko zarządca może to zmienić."
}
```

Top-level:

```json
"notifications": {
  "title": "Powiadomienia",
  "open": "Otwórz powiadomienia",
  "empty": "Brak powiadomień",
  "markAllRead": "Oznacz wszystkie jako przeczytane",
  "types": {
    "PACKAGE_RECEIVED": {
      "title": "Paczka zarejestrowana",
      "body": "Dla {buildingName} / {apartmentNumber} dotarła paczka."
    },
    "PACKAGE_REMINDER": {
      "title": "Paczka czeka",
      "body": "Twoja paczka dla {buildingName} / {apartmentNumber} czeka już {daysWaiting, plural, one {# dzień} few {# dni} many {# dni} other {# dni}}."
    },
    "PACKAGE_REMINDER_AUTO": {
      "title": "Paczka czeka",
      "body": "Twoja paczka dla {buildingName} / {apartmentNumber} czeka już {daysWaiting, plural, one {# dzień} few {# dni} many {# dni} other {# dni}}."
    }
  }
}
```

- [ ] **Step 3: Run the i18n tests and typecheck**

Run: `npx vitest run i18n && npx tsc --noEmit`
Expected: PASS; the Task 7 type errors are gone. If the `messages.test.ts` placeholder check rejects the plural syntax, simplify the `waitingDays` / `daysWaiting` strings to a plain `{count}` form with "days" in both languages and note it in the commit message.

- [ ] **Step 4: Commit**

```bash
git add messages
git commit -m "feat: add notification and reminder messages

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Notification bell

**Files:**
- Create: `components/notifications/NotificationBell.tsx`
- Modify: `components/TopBar.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications`, `markNotificationReadAction`, `markAllNotificationsReadAction`, `NotificationType`, message keys from Task 8.

- [ ] **Step 1: Create `components/notifications/NotificationBell.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/notifications";
import type { NotificationType } from "@/domain/notifications/types";

type Item = {
  id: string;
  type: NotificationType;
  payload: Record<string, string | number>;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      // Network blip: keep showing the previous state.
    }
  }, []);

  // Refresh on every navigation and whenever the menu opens.
  useEffect(() => {
    load();
  }, [load, pathname, open]);

  const openItem = async (item: Item) => {
    if (!item.readAt) await markNotificationReadAction(item.id);
    await load();
    router.push("/packages");
  };

  const markAll = async () => {
    await markAllNotificationsReadAction();
    await load();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("open")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("title")}</span>
          {unread > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={markAll}>
              {t("markAllRead")}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => openItem(item)}
              className="flex flex-col items-start gap-0.5"
            >
              <span className={item.readAt ? "text-sm" : "text-sm font-semibold"}>
                {t(`types.${item.type}.title`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`types.${item.type}.body`, item.payload)}
              </span>
              <span className="text-xs text-muted-foreground">
                {format.relativeTime(new Date(item.createdAt))}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Mount it in `components/TopBar.tsx`**

Add `import { NotificationBell } from "@/components/notifications/NotificationBell";` and, inside the signed-in fragment, render `<NotificationBell />` directly before `<DropdownMenu>` (the avatar menu).

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. If `t(...)` with dynamic keys or `item.payload` params fails typing, cast the param object (`item.payload as Record<string, string | number>`) rather than loosening `Messages`.

- [ ] **Step 4: Commit**

```bash
git add components
git commit -m "feat: add notification bell to the top bar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Packages UI — remind button, waiting label, reminder settings

**Files:**
- Create: `components/packages/ReminderSettings.tsx`
- Modify: `components/packages/PackageCard.tsx`, `components/packages/PackagesList.tsx`, `app/packages/page.tsx`

**Interfaces:**
- Consumes: `remindPackageAction`, `updateReminderSettingsAction`, `getReminderAfterDays`, `canEditNotificationSettings`, message keys from Task 8.
- Produces: `PackagesList` props `reminderAfterDays: number | null`, `canEditReminders: boolean`.

- [ ] **Step 1: Update `PackageCard.tsx`**

Add imports: `Bell` to the lucide import; `remindPackageAction` to the `@/actions/packages` import.

Add after `handlePickup`:

```tsx
  const handleRemind = async () => {
    setIsUpdating(true);
    try {
      const result = await remindPackageAction(pkg.id);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const daysWaiting = Math.floor(
    (Date.now() - new Date(pkg.receivedAt).getTime()) / (24 * 60 * 60 * 1000),
  );
```

Directly after the `receivedAt` paragraph add:

```tsx
          {pkg.status !== "PICKED_UP" && daysWaiting >= 1 && (
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              {t("waitingDays", { count: daysWaiting })}
            </p>
          )}
```

Replace the existing pick-up button block with a wrapper holding both buttons:

```tsx
          {canMarkPickedUp && pkg.status !== "PICKED_UP" && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={handlePickup} disabled={isUpdating}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isUpdating ? t("saving") : t("pickUp")}
              </Button>
              <Button size="sm" variant="outline" onClick={handleRemind} disabled={isUpdating}>
                <Bell className="mr-2 h-4 w-4" />
                {t("remind")}
              </Button>
            </div>
          )}
```

- [ ] **Step 2: Create `components/packages/ReminderSettings.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateReminderSettingsAction } from "@/actions/notifications";

type ActionState = { message: string; success: boolean };

export function ReminderSettings({
  communityId,
  reminderAfterDays,
  canEdit,
}: {
  communityId: string;
  reminderAfterDays: number | null;
  canEdit: boolean;
}) {
  const t = useTranslations("packages.reminderSettings");
  const [enabled, setEnabled] = useState(reminderAfterDays !== null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateReminderSettingsAction,
    { message: "", success: false },
  );

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="communityId" value={communityId} />
          <div className="flex items-center gap-2">
            <Switch
              id="reminder-enabled"
              name="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!canEdit}
            />
            <Label htmlFor="reminder-enabled">{t("enabled")}</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reminder-days">{t("days")}</Label>
            <Input
              id="reminder-days"
              name="days"
              type="number"
              min={1}
              max={60}
              defaultValue={reminderAfterDays ?? 3}
              disabled={!canEdit || !enabled}
              className="w-24"
            />
          </div>
          {canEdit ? (
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire it through `PackagesList.tsx` and `app/packages/page.tsx`**

In `PackagesList.tsx`: import `ReminderSettings`; add props `reminderAfterDays: number | null` and `canEditReminders: boolean` to the destructure and the prop type; render, directly above the `{packages.length === 0 ? ...` block:

```tsx
      {isStaff && (
        <ReminderSettings
          communityId={communityId}
          reminderAfterDays={reminderAfterDays}
          canEdit={canEditReminders}
        />
      )}
```

In `app/packages/page.tsx`: import `{ canEditNotificationSettings, getReminderAfterDays } from "@/domain/notifications/settings"`; after `isStaff` is computed add:

```tsx
  const reminderAfterDays = isStaff ? await getReminderAfterDays(membership.communityId) : null;
  const canEditReminders = canEditNotificationSettings(membership);
```

and pass `reminderAfterDays={reminderAfterDays}` and `canEditReminders={canEditReminders}` to `<PackagesList>`.

- [ ] **Step 4: Typecheck, lint, full test run**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components app/packages
git commit -m "feat: add remind button, waiting label and reminder settings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full automated check**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all PASS. `npm run build` also confirms `vercel.json` does not affect the Next build.

- [ ] **Step 2: Manual check against the local database** (`npm run dev`, then in the browser)

1. Sign in as a receptionist. Register a package for an apartment that has a resident.
2. Sign in as that resident. The bell shows a badge of 1; the menu lists "Package registered"; clicking it marks it read and opens `/packages`.
3. As the receptionist, click **Remind** on the package: toast "Reminder sent". Click again within the hour: toast "A reminder was already sent recently".
4. As a manager, open `/packages`, enable "Remind automatically" with 1 day, save. As a receptionist the same card is read-only.
5. Backdate the package (`UPDATE "Package" SET "receivedAt" = now() - interval '2 days'`), then:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/package-reminders
```

Expected: `{"sent":1,"dispatched":{...}}`; running it again returns `"sent":0`. Without the header: HTTP 401.

- [ ] **Step 3: Report**

Summarize what was verified and anything skipped (for example the Clerk-authenticated browser steps if no test accounts are available) in the final message; do not claim the manual steps passed unless they were run.
