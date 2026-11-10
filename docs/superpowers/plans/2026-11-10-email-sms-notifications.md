# Email and SMS Notification Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Residents can opt in to email and/or SMS for every notification (package received, reminders); in-app stays always on.

**Architecture:** A `NotificationPreference` row per user drives which `NotificationDelivery` rows `notify()` creates. Two new `ChannelAdapter`s (Resend email, SMSAPI SMS, both plain `fetch`) plug into the existing `dispatchPending()` retry machinery. Server actions trigger `dispatchPending()` right after the request via `after()`; the daily cron remains the retry sweeper.

**Tech Stack:** Next.js 15 (`after` from `next/server`), Prisma 6 + Postgres, next-intl 4 (`createTranslator`), zod, vitest (real DB, `fileParallelism: false`), Sonner toasts.

## Global Constraints

- Opt-in is per channel (email, SMS), applies to all notification types. Defaults: both off. No row = both off.
- In-app channel is hardcoded in channel resolution and can never be opted out.
- Providers: Resend (email), SMSAPI.pl (SMS). Plain `fetch`; no new dependencies.
- Phone: E.164 regex `/^\+[1-9]\d{7,14}$/` after stripping spaces and dashes; stored normalised. No OTP.
- Result mapping for providers: 2xx → ok; 5xx, 429, network error → retry; other 4xx → fail. Missing env vars → fail with explicit error.
- Env vars: `RESEND_API_KEY`, `EMAIL_FROM`, `SMSAPI_TOKEN`, `SMSAPI_SENDER` (optional), `APP_URL` (for the email footer link).
- Message copy comes from `messages/{pl,en}.json` (`notifications.types.<TYPE>`); every new key must exist in both files (`i18n/messages.test.ts` enforces parity and placeholder equality).
- Phone numbers are never logged and never exposed to other users.
- No audit log for preference changes (`writeAuditLog` requires a `communityId`; this is personal data).
- Tests: vitest against the real dev DB. Run a single file with `npx vitest run <path>`. `docker compose up -d postgres` must be running.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Commit only the files listed in the task (the working tree has unrelated changes).

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, new migration | `NotificationPreference` model |
| `domain/notifications/preferences.ts` | `getPreferences`, `updatePreferences`, phone normalisation/validation |
| `domain/notifications/channels/index.ts` | registry + `resolveChannelsByUser` |
| `domain/notifications/channels/http.ts` | `toResult` — shared HTTP-status → `SendResult` mapping |
| `domain/notifications/channels/render.ts` | `renderNotification` — localised title/body/footer |
| `domain/notifications/channels/email.ts` | Resend adapter |
| `domain/notifications/channels/sms.ts` | SMSAPI adapter |
| `domain/notifications/index.ts` | `notify()` uses per-user channels |
| `domain/notifications/dispatch.ts` | atomic claim so concurrent runs don't double-send |
| `actions/packages.ts`, `actions/notifications.ts` | `after(dispatchPending)`; preferences action |
| `components/settings/NotificationChannels.tsx` | settings card UI |
| `components/settings/SettingsForm.tsx`, `app/settings/page.tsx` | wire the card in |

Spec clarification: "clearing the phone forces smsEnabled=false" is implemented in the UI (clearing the phone input saves `smsEnabled:false`); the domain rejects `smsEnabled:true` without a phone.

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (User model ~line 38; append new model)
- Create: `prisma/migrations/<timestamp>_add_notification_preferences/migration.sql` (generated)
- Modify: `lib/generated/prisma/*` (regenerated, tracked in git)

**Interfaces:**
- Produces: Prisma model `NotificationPreference { userId (PK), emailEnabled, smsEnabled, phone?, updatedAt }`, accessor `prisma.notificationPreference`, relation `User.notificationPreference`. Deleting a user cascades to the row (so `cleanupDatabase()`'s `user.deleteMany()` needs no change).

- [ ] **Step 1: Add the model**

In `User`, after `notifications     Notification[]       @relation("NotificationRecipient")` add:

```prisma
  notificationPreference NotificationPreference?
```

Append at the end of the notification section (after `NotificationDelivery`):

```prisma
model NotificationPreference {
  userId       String   @id
  emailEnabled Boolean  @default(false)
  smsEnabled   Boolean  @default(false)
  phone        String?
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Generate migration and client**

Run: `npx prisma migrate dev --name add_notification_preferences`
Expected: new folder under `prisma/migrations/`, "Your database is now in sync", client regenerated. (If it asks to reset the DB because of drift, stop and ask the user.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/generated/prisma
git commit -m "feat: add NotificationPreference model

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Preferences domain

**Files:**
- Create: `domain/notifications/preferences.ts`
- Test: `domain/notifications/preferences.test.ts`

**Interfaces:**
- Consumes: `prisma.notificationPreference` (Task 1), `ValidationError` from `@/domain/errors`, `SessionUser` from `@/auth/session`.
- Produces:
  - `type NotificationPreferences = { emailEnabled: boolean; smsEnabled: boolean; phone: string | null }`
  - `getPreferences(userId: string): Promise<NotificationPreferences>` — defaults `{false,false,null}` when no row.
  - `updatePreferences(actor: SessionUser, input: NotificationPreferences): Promise<void>` — upserts the actor's own row; throws `ValidationError` on bad phone or `smsEnabled` without phone.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { ValidationError } from "@/domain/errors";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { getPreferences, updatePreferences } from "@/domain/notifications/preferences";

afterEach(async () => {
  await cleanupDatabase();
});

describe("preferences", () => {
  it("defaults to everything off when no row exists", async () => {
    const { resident } = await createPackageScenario();
    expect(await getPreferences(resident.id)).toEqual({
      emailEnabled: false,
      smsEnabled: false,
      phone: null,
    });
  });

  it("saves and normalises the phone number", async () => {
    const { resident } = await createPackageScenario();
    await updatePreferences(resident, { emailEnabled: true, smsEnabled: true, phone: "+48 123-456 789" });
    expect(await getPreferences(resident.id)).toEqual({
      emailEnabled: true,
      smsEnabled: true,
      phone: "+48123456789",
    });
  });

  it("updates an existing row", async () => {
    const { resident } = await createPackageScenario();
    await updatePreferences(resident, { emailEnabled: true, smsEnabled: false, phone: null });
    await updatePreferences(resident, { emailEnabled: false, smsEnabled: false, phone: null });
    expect((await getPreferences(resident.id)).emailEnabled).toBe(false);
    expect(await prisma.notificationPreference.count()).toBe(1);
  });

  it("rejects a malformed phone", async () => {
    const { resident } = await createPackageScenario();
    for (const phone of ["123456789", "+0123456789", "+48abc", "+48123"]) {
      await expect(
        updatePreferences(resident, { emailEnabled: false, smsEnabled: false, phone }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("rejects smsEnabled without a phone", async () => {
    const { resident } = await createPackageScenario();
    await expect(
      updatePreferences(resident, { emailEnabled: false, smsEnabled: true, phone: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updatePreferences(resident, { emailEnabled: false, smsEnabled: true, phone: "  " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("only ever writes the actor's own row", async () => {
    const { resident, receptionist } = await createPackageScenario();
    await updatePreferences(resident, { emailEnabled: true, smsEnabled: false, phone: null });
    expect((await getPreferences(receptionist.id)).emailEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run domain/notifications/preferences.test.ts`
Expected: FAIL — cannot resolve `@/domain/notifications/preferences`.

- [ ] **Step 3: Implement**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { ValidationError } from "@/domain/errors";

export type NotificationPreferences = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  phone: string | null;
};

const E164 = /^\+[1-9]\d{7,14}$/;
const DEFAULTS: NotificationPreferences = { emailEnabled: false, smsEnabled: false, phone: null };

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!row) return DEFAULTS;
  return { emailEnabled: row.emailEnabled, smsEnabled: row.smsEnabled, phone: row.phone };
}

// A user may only change their own preferences, so there is no role check.
export async function updatePreferences(actor: SessionUser, input: NotificationPreferences) {
  const stripped = input.phone?.replace(/[\s-]/g, "") ?? "";
  const phone = stripped === "" ? null : stripped;
  if (phone !== null && !E164.test(phone)) {
    throw new ValidationError("phone must be in E.164 format, e.g. +48123456789");
  }
  if (input.smsEnabled && phone === null) {
    throw new ValidationError("smsEnabled requires a phone number");
  }
  const data = { emailEnabled: input.emailEnabled, smsEnabled: input.smsEnabled, phone };
  await prisma.notificationPreference.upsert({
    where: { userId: actor.id },
    create: { userId: actor.id, ...data },
    update: data,
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run domain/notifications/preferences.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add domain/notifications/preferences.ts domain/notifications/preferences.test.ts
git commit -m "feat: notification preferences domain

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Per-user channel resolution in notify()

**Files:**
- Modify: `domain/notifications/channels/index.ts`
- Modify: `domain/notifications/index.ts`
- Test: `domain/notifications/notify.test.ts` (append)

**Interfaces:**
- Consumes: `prisma.notificationPreference` (Task 1).
- Produces: `resolveChannelsByUser(tx: Prisma.TransactionClient, userIds: string[]): Promise<Map<string, string[]>>` — every user maps to `["in-app", ...("email" if emailEnabled), ...("sms" if smsEnabled && phone)]`. Replaces `resolveChannels()` (only `notify()` used it). Channel ids `"email"` and `"sms"` are the ids Tasks 4–5 must register.

- [ ] **Step 1: Write the failing tests** — append to `domain/notifications/notify.test.ts` (it already imports `prisma`, `notify`, fixtures, and defines `payload`):

```ts
describe("notify channel resolution", () => {
  const send = (communityId: string, userIds: string[]) =>
    prisma.$transaction((tx) =>
      notify(tx, { communityId, type: "PACKAGE_RECEIVED", recipientUserIds: userIds, payload }),
    );

  it("gives opted-out users only the in-app delivery", async () => {
    const { community, resident } = await createPackageScenario();
    await send(community.id, [resident.id]);
    const channelsUsed = (await prisma.notificationDelivery.findMany()).map((d) => d.channel);
    expect(channelsUsed).toEqual(["in-app"]);
  });

  it("adds PENDING email and sms deliveries for opted-in users", async () => {
    const { community, resident } = await createPackageScenario();
    await prisma.notificationPreference.create({
      data: { userId: resident.id, emailEnabled: true, smsEnabled: true, phone: "+48123456789" },
    });
    await send(community.id, [resident.id]);
    const deliveries = await prisma.notificationDelivery.findMany({ orderBy: { channel: "asc" } });
    expect(deliveries.map((d) => [d.channel, d.status])).toEqual([
      ["email", "PENDING"],
      ["in-app", "SENT"],
      ["sms", "PENDING"],
    ]);
  });

  it("skips sms when enabled but no phone is stored", async () => {
    const { community, resident } = await createPackageScenario();
    await prisma.notificationPreference.create({
      data: { userId: resident.id, smsEnabled: true, phone: null },
    });
    await send(community.id, [resident.id]);
    expect((await prisma.notificationDelivery.findMany()).map((d) => d.channel)).toEqual(["in-app"]);
  });

  it("resolves channels per recipient", async () => {
    const { community, resident, receptionist } = await createPackageScenario();
    await prisma.notificationPreference.create({
      data: { userId: resident.id, emailEnabled: true },
    });
    await send(community.id, [resident.id, receptionist.id]);
    expect(await prisma.notificationDelivery.count()).toBe(3);
    expect(await prisma.notificationDelivery.count({ where: { channel: "email" } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run domain/notifications/notify.test.ts`
Expected: new tests FAIL (opted-in user gets no email/sms delivery).

- [ ] **Step 3: Implement**

Replace `domain/notifications/channels/index.ts`:

```ts
import type { Prisma } from "@/lib/generated/prisma";
import { inAppChannel } from "./in-app";
import type { ChannelAdapter } from "./types";

// Register new channels (email, sms, push, ...) here.
export const channels: Record<string, ChannelAdapter> = {
  [inAppChannel.id]: inAppChannel,
};

// In-app is always included and cannot be opted out. Email / sms are added per the
// user's NotificationPreference (no row = both off).
// ponytail: preferences apply to every notification type; add a type parameter and a
// per-type table here if someone wants "SMS only for reminders".
export async function resolveChannelsByUser(
  tx: Prisma.TransactionClient,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const prefs = await tx.notificationPreference.findMany({ where: { userId: { in: userIds } } });
  const byUser = new Map(prefs.map((p) => [p.userId, p]));
  return new Map(
    userIds.map((id) => {
      const p = byUser.get(id);
      const ids: string[] = [inAppChannel.id];
      if (p?.emailEnabled) ids.push("email");
      if (p?.smsEnabled && p.phone) ids.push("sms");
      return [id, ids];
    }),
  );
}
```

In `domain/notifications/index.ts` change the import to `import { channels, resolveChannelsByUser } from "./channels";` and replace everything from `const now = new Date();` to the end of the function with:

```ts
  const now = new Date();
  const channelsByUser = await resolveChannelsByUser(tx, recipientIds);
  await tx.notificationDelivery.createMany({
    data: created.flatMap((notification) =>
      channelsByUser.get(notification.recipientUserId)!.map((channel) => {
        const instant = channels[channel]?.instant === true;
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

- [ ] **Step 4: Run notifications tests**

Run: `npx vitest run domain/notifications`
Expected: PASS (all existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add domain/notifications/channels/index.ts domain/notifications/index.ts domain/notifications/notify.test.ts
git commit -m "feat: resolve notification channels per user preference

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Localised rendering + email adapter

**Files:**
- Create: `domain/notifications/channels/http.ts`, `domain/notifications/channels/render.ts`, `domain/notifications/channels/email.ts`
- Modify: `domain/notifications/channels/index.ts` (register), `messages/pl.json`, `messages/en.json`, `.env.example`
- Test: `domain/notifications/channels/email.test.ts`

**Interfaces:**
- Consumes: `ChannelAdapter`, `SendResult` from `./types`; `resolveLocale` from `@/i18n/locale`.
- Produces:
  - `toResult(request: () => Promise<Response>, isError?: (body: string) => boolean): Promise<SendResult>` (Task 5 reuses it).
  - `renderNotification(notification: Notification, user: User): { title: string; body: string; footer: string }`.
  - `emailChannel: ChannelAdapter` with `id: "email"`, registered in `channels`.

- [ ] **Step 1: Add message keys**

`messages/en.json`, inside the top-level `"notifications"` object (sibling of `"types"`):

```json
    "email": {
      "footer": "Change your notification settings: {url}"
    },
```

`messages/pl.json`, same place:

```json
    "email": {
      "footer": "Zmień ustawienia powiadomień: {url}"
    },
```

- [ ] **Step 2: Write the failing test** — `domain/notifications/channels/email.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification, User } from "@/lib/generated/prisma";
import { emailChannel } from "@/domain/notifications/channels/email";

const notification = {
  id: "n1",
  type: "PACKAGE_RECEIVED",
  payload: { packageId: "p1", buildingName: "Building A", apartmentNumber: "101" },
} as unknown as Notification;
const user = { email: "ala@example.com", locale: "en" } as unknown as User;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Quattro <noreply@example.com>");
  vi.stubEnv("APP_URL", "https://quattro.test");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("emailChannel", () => {
  it("posts a localised message to Resend and returns ok on 2xx", async () => {
    fetchMock.mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));

    expect(await emailChannel.send(notification, user)).toEqual({ status: "ok" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["ala@example.com"]);
    expect(body.from).toBe("Quattro <noreply@example.com>");
    expect(body.subject).toBe("Package registered");
    expect(body.text).toContain("A package arrived for Building A / 101.");
    expect(body.text).toContain("https://quattro.test/settings");
  });

  it("uses the user's locale", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await emailChannel.send(notification, { ...user, locale: "pl" } as User);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).subject).toBe("Paczka zarejestrowana");
  });

  it("maps 5xx and 429 to retry, other 4xx to fail", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 503 }));
    expect((await emailChannel.send(notification, user)).status).toBe("retry");
    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }));
    expect((await emailChannel.send(notification, user)).status).toBe("retry");
    fetchMock.mockResolvedValueOnce(new Response("bad address", { status: 422 }));
    expect((await emailChannel.send(notification, user)).status).toBe("fail");
  });

  it("retries on network errors", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect((await emailChannel.send(notification, user)).status).toBe("retry");
  });

  it("fails without calling the API when env vars are missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await emailChannel.send(notification, user);
    expect(result.status).toBe("fail");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run domain/notifications/channels/email.test.ts`
Expected: FAIL — cannot resolve `channels/email`.

- [ ] **Step 4: Implement**

`domain/notifications/channels/http.ts`:

```ts
import type { SendResult } from "./types";

// 5xx, 429 and network errors are worth retrying; any other non-2xx is a permanent failure.
// isError lets a provider that reports errors inside a 2xx body flag them.
export async function toResult(
  request: () => Promise<Response>,
  isError?: (body: string) => boolean,
): Promise<SendResult> {
  let res: Response;
  try {
    res = await request();
  } catch (error) {
    return { status: "retry", error: String(error) };
  }
  const body = await res.text();
  if (res.ok && !isError?.(body)) return { status: "ok" };
  const error = `HTTP ${res.status}: ${body.slice(0, 200)}`;
  const transient = res.status >= 500 || res.status === 429;
  return { status: transient ? "retry" : "fail", error };
}
```

`domain/notifications/channels/render.ts`:

```ts
import { createTranslator } from "next-intl";
import type { Notification, User } from "@/lib/generated/prisma";
import { resolveLocale } from "@/i18n/locale";
import en from "@/messages/en.json";
import pl from "@/messages/pl.json";

const catalogs = { en, pl };

// Same copy as the in-app inbox (notifications.types.<TYPE>), in the recipient's locale.
// createTranslator works outside a request, unlike getTranslations (cron / after()).
export function renderNotification(notification: Notification, user: User) {
  const locale = resolveLocale({ userLocale: user.locale });
  const messages = catalogs[locale];
  const types = createTranslator({ locale, messages, namespace: "notifications.types" });
  const email = createTranslator({ locale, messages, namespace: "notifications.email" });
  const values = notification.payload as Record<string, string | number>;
  const url = `${process.env.APP_URL ?? ""}/settings`;
  return {
    title: types(`${notification.type}.title` as never, values),
    body: types(`${notification.type}.body` as never, values),
    footer: email("footer" as never, { url }),
  };
}
```

`domain/notifications/channels/email.ts`:

```ts
import { toResult } from "./http";
import { renderNotification } from "./render";
import type { ChannelAdapter } from "./types";

export const emailChannel: ChannelAdapter = {
  id: "email",
  async send(notification, user) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) return { status: "fail", error: "RESEND_API_KEY / EMAIL_FROM not set" };

    const { title, body, footer } = renderNotification(notification, user);
    return toResult(() =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: title,
          text: `${body}\n\n${footer}`,
        }),
      }),
    );
  },
};
```

In `channels/index.ts` add `import { emailChannel } from "./email";` and `[emailChannel.id]: emailChannel,` to the `channels` record.

Append to `.env.example`:

```
# Email via Resend (https://resend.com). EMAIL_FROM must be a verified sender, e.g. "Quattro <noreply@yourdomain.pl>"
RESEND_API_KEY=
EMAIL_FROM=
# Public base URL of the app; used for the settings link in emails
APP_URL=
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run domain/notifications i18n && npx tsc --noEmit`
Expected: PASS. If `tsc` complains about `createTranslator` generics or the JSON import, adjust the casts in `render.ts` only (keep the runtime behaviour); do not change the test.

- [ ] **Step 6: Commit**

```bash
git add domain/notifications/channels messages/pl.json messages/en.json .env.example
git commit -m "feat: email notification channel via Resend

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: SMS adapter

**Files:**
- Create: `domain/notifications/channels/sms.ts`
- Modify: `domain/notifications/channels/index.ts` (register), `.env.example`
- Test: `domain/notifications/channels/sms.test.ts`

**Interfaces:**
- Consumes: `toResult` (Task 4), `renderNotification` (Task 4, only `body` is used — SMS has no subject), `prisma.notificationPreference` (phone lookup, since `send` receives only `User`).
- Produces: `smsChannel: ChannelAdapter` with `id: "sms"`, registered in `channels`.

- [ ] **Step 1: Write the failing test** — `domain/notifications/channels/sms.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import type { Notification } from "@/lib/generated/prisma";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { smsChannel } from "@/domain/notifications/channels/sms";

const notification = {
  id: "n1",
  type: "PACKAGE_RECEIVED",
  payload: { packageId: "p1", buildingName: "Building A", apartmentNumber: "101" },
} as unknown as Notification;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SMSAPI_TOKEN", "tok");
  vi.stubEnv("SMSAPI_SENDER", "Quattro");
});

afterEach(async () => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await cleanupDatabase();
});

async function residentWithPhone(phone: string | null = "+48123456789") {
  const { resident } = await createPackageScenario();
  if (phone) {
    await prisma.notificationPreference.create({
      data: { userId: resident.id, smsEnabled: true, phone },
    });
  }
  return { ...resident, locale: "en" };
}

describe("smsChannel", () => {
  it("posts the message to SMSAPI with the phone minus the plus sign", async () => {
    fetchMock.mockResolvedValue(new Response('{"count":1}', { status: 200 }));
    const user = await residentWithPhone();

    expect(await smsChannel.send(notification, user)).toEqual({ status: "ok" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.smsapi.pl/sms.do");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const form = new URLSearchParams(init.body);
    expect(form.get("to")).toBe("48123456789");
    expect(form.get("from")).toBe("Quattro");
    expect(form.get("message")).toBe("A package arrived for Building A / 101.");
    expect(form.get("format")).toBe("json");
  });

  it("treats an error object inside a 200 response as a failure", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":101,"message":"Authorization failed"}', { status: 200 }),
    );
    const result = await smsChannel.send(notification, await residentWithPhone());
    expect(result.status).toBe("fail");
  });

  it("maps 5xx to retry and 4xx to fail", async () => {
    const user = await residentWithPhone();
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 502 }));
    expect((await smsChannel.send(notification, user)).status).toBe("retry");
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));
    expect((await smsChannel.send(notification, user)).status).toBe("fail");
  });

  it("fails without calling the API when the token is missing or no phone is stored", async () => {
    const user = await residentWithPhone();
    vi.stubEnv("SMSAPI_TOKEN", "");
    expect((await smsChannel.send(notification, user)).status).toBe("fail");
    vi.stubEnv("SMSAPI_TOKEN", "tok");
    const noPhone = await residentWithPhone(null);
    expect((await smsChannel.send(notification, noPhone)).status).toBe("fail");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run domain/notifications/channels/sms.test.ts`
Expected: FAIL — cannot resolve `channels/sms`.

- [ ] **Step 3: Implement**

`domain/notifications/channels/sms.ts`:

```ts
import prisma from "@/lib/prisma";
import { toResult } from "./http";
import { renderNotification } from "./render";
import type { ChannelAdapter } from "./types";

// SMSAPI can answer 200 with {"error": <code>, "message": ...}.
const hasErrorField = (body: string) => {
  try {
    return "error" in JSON.parse(body);
  } catch {
    return false;
  }
};

export const smsChannel: ChannelAdapter = {
  id: "sms",
  async send(notification, user) {
    const token = process.env.SMSAPI_TOKEN;
    if (!token) return { status: "fail", error: "SMSAPI_TOKEN not set" };

    const pref = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    if (!pref?.phone) return { status: "fail", error: "No phone number stored" };

    const { body } = renderNotification(notification, user);
    const form = new URLSearchParams({
      to: pref.phone.replace(/^\+/, ""),
      message: body,
      format: "json",
      encoding: "utf-8",
    });
    if (process.env.SMSAPI_SENDER) form.set("from", process.env.SMSAPI_SENDER);

    return toResult(
      () =>
        fetch("https://api.smsapi.pl/sms.do", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }),
      hasErrorField,
    );
  },
};
```

In `channels/index.ts` add `import { smsChannel } from "./sms";` and `[smsChannel.id]: smsChannel,` to the record.

Append to `.env.example`:

```
# SMS via SMSAPI.pl (https://www.smsapi.pl). SMSAPI_SENDER is optional (must be a registered sender name)
SMSAPI_TOKEN=
SMSAPI_SENDER=
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run domain/notifications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/notifications/channels/sms.ts domain/notifications/channels/sms.test.ts domain/notifications/channels/index.ts .env.example
git commit -m "feat: SMS notification channel via SMSAPI

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Safe immediate dispatch

Two dispatchers can now overlap (the `after()` call and the daily cron), so claim each delivery atomically before sending.

**Files:**
- Modify: `domain/notifications/dispatch.ts`, `actions/packages.ts`
- Test: `domain/notifications/dispatch.test.ts` (append)

**Interfaces:**
- Consumes: `dispatchPending(adapters?, now?)` (existing).
- Produces: `dispatchPending` sends each PENDING delivery at most once per attempt even when run concurrently. `createPackageAction` and `remindPackageAction` trigger it after the response.

- [ ] **Step 1: Write the failing test** — append to `domain/notifications/dispatch.test.ts` (reuses its `pendingDelivery` helper and `ChannelAdapter` import):

```ts
describe("dispatchPending concurrency", () => {
  it("sends a delivery once when two dispatchers run at the same time", async () => {
    await pendingDelivery();
    let calls = 0;
    const adapters: Record<string, ChannelAdapter> = {
      fake: {
        id: "fake",
        send: async () => {
          calls++;
          await new Promise((r) => setTimeout(r, 50));
          return { status: "ok" };
        },
      },
    };

    await Promise.all([dispatchPending(adapters), dispatchPending(adapters)]);

    expect(calls).toBe(1);
    expect((await prisma.notificationDelivery.findFirstOrThrow()).status).toBe("SENT");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run domain/notifications/dispatch.test.ts`
Expected: new test FAILS (`calls` is 2).

- [ ] **Step 3: Implement the claim**

In `dispatch.ts`, replace the comment block above `dispatchPending` with:

```ts
// Runs from the daily cron (retry sweeper) and right after requests via after().
// Each delivery is claimed with an optimistic bump of `attempts`, so overlapping runs
// cannot double-send. A crash between claim and result leaves it PENDING with
// nextAttemptAt null, so the next run retries (at-least-once).
```

and replace the first two lines of the loop body (`const adapter = ...` / `const attempts = ...`) with:

```ts
    const attempts = delivery.attempts + 1;
    const claimed = await prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, status: "PENDING", attempts: delivery.attempts },
      data: { attempts },
    });
    if (claimed.count === 0) continue;
    const adapter = adapters[delivery.channel];
```

- [ ] **Step 4: Trigger dispatch after actions**

In `actions/packages.ts` add imports:

```ts
import { after } from "next/server";
import { dispatchPending } from "@/domain/notifications/dispatch";
```

In `createPackageAction`, directly after `revalidatePath("/packages");` (inside the `try`, ~line 62) add:

```ts
    after(() => dispatchPending().catch(console.error));
```

In `remindPackageAction`, directly after `const { notified } = await remindPackage(actor, packageId);` add the same line. (`after` can't live in the domain functions: they run in vitest outside a request scope.)

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run domain/notifications && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add domain/notifications/dispatch.ts domain/notifications/dispatch.test.ts actions/packages.ts
git commit -m "feat: dispatch email/sms right after package actions, claim deliveries atomically

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Settings UI and action

**Files:**
- Modify: `actions/notifications.ts`, `components/settings/SettingsForm.tsx`, `app/settings/page.tsx`, `messages/pl.json`, `messages/en.json`
- Create: `components/settings/NotificationChannels.tsx`

**Interfaces:**
- Consumes: `getPreferences`, `updatePreferences`, `NotificationPreferences` (Task 2); `getCurrentUser` from `@/auth/session`.
- Produces: `updateNotificationPreferencesAction(input: unknown): Promise<{ message: string; success: boolean }>`; `<NotificationChannels initial={NotificationPreferences} email={string} />`; `SettingsForm` takes `initialNotifications: NotificationPreferences` and `email: string`.

- [ ] **Step 1: Messages**

Replace the `settings.notifications` object in both files.

`messages/en.json`:

```json
    "notifications": {
      "title": "Notifications",
      "description": "Choose how you want to be notified",
      "inApp": "In-app",
      "inAppHint": "Always on",
      "email": "Email",
      "emailHint": "Sent to {email}",
      "sms": "SMS",
      "smsHint": "Text messages to your phone",
      "phoneLabel": "Phone number",
      "phonePlaceholder": "+48 123 456 789",
      "saved": "Notification settings saved",
      "phoneInvalid": "Enter the phone number in international format, e.g. +48123456789",
      "failed": "Could not save notification settings"
    },
```

`messages/pl.json`:

```json
    "notifications": {
      "title": "Powiadomienia",
      "description": "Wybierz, jak chcesz być powiadamiany",
      "inApp": "W aplikacji",
      "inAppHint": "Zawsze włączone",
      "email": "E-mail",
      "emailHint": "Wysyłane na {email}",
      "sms": "SMS",
      "smsHint": "Wiadomości tekstowe na Twój telefon",
      "phoneLabel": "Numer telefonu",
      "phonePlaceholder": "+48 123 456 789",
      "saved": "Zapisano ustawienia powiadomień",
      "phoneInvalid": "Podaj numer telefonu w formacie międzynarodowym, np. +48123456789",
      "failed": "Nie udało się zapisać ustawień powiadomień"
    },
```

(The old `settings.notifications.email` string "Email notifications" is replaced by the new `email` key above.)

- [ ] **Step 2: Action** — append to `actions/notifications.ts` (add `import { updatePreferences } from "@/domain/notifications/preferences";` to the imports; `z`, `getTranslations`, `getCurrentUser`, `ValidationError`, `ActionState` are already there):

```ts
const preferencesSchema = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  phone: z.string().max(32).nullable(),
});

export async function updateNotificationPreferencesAction(input: unknown): Promise<ActionState> {
  const t = await getTranslations("settings.notifications");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { message: t("failed"), success: false };

  try {
    await updatePreferences(actor, parsed.data);
    return { message: t("saved"), success: true };
  } catch (error) {
    if (error instanceof ValidationError) return { message: t("phoneInvalid"), success: false };
    console.error(error);
    return { message: t("failed"), success: false };
  }
}
```

- [ ] **Step 3: Component** — `components/settings/NotificationChannels.tsx`

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateNotificationPreferencesAction } from "@/actions/notifications";
import type { NotificationPreferences } from "@/domain/notifications/preferences";

export function NotificationChannels({
  initial,
  email,
}: {
  initial: NotificationPreferences;
  email: string;
}) {
  const t = useTranslations("settings.notifications");
  const [saved, setSaved] = useState(initial);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [busy, setBusy] = useState(false);

  const clean = (raw: string) => raw.replace(/[\s-]/g, "");

  const save = async (next: NotificationPreferences) => {
    setBusy(true);
    try {
      const res = await updateNotificationPreferencesAction(next);
      if (res.success) {
        setSaved(next);
        setPhone(next.phone ?? "");
        toast.success(res.message);
      } else {
        setPhone(saved.phone ?? "");
        toast.error(res.message);
      }
    } catch {
      setPhone(saved.phone ?? "");
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const savePhone = () => {
    const next = clean(phone) || null;
    if (next === saved.phone) return;
    // Clearing the number also turns SMS off.
    void save({ ...saved, phone: next, smsEnabled: next ? saved.smsEnabled : false });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="notif-inapp">{t("inApp")}</Label>
          <p className="text-sm text-muted-foreground">{t("inAppHint")}</p>
        </div>
        <Switch id="notif-inapp" checked disabled />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="notif-email">{t("email")}</Label>
          <p className="text-sm text-muted-foreground break-all">{t("emailHint", { email })}</p>
        </div>
        <Switch
          id="notif-email"
          checked={saved.emailEnabled}
          disabled={busy}
          onCheckedChange={(v) => save({ ...saved, emailEnabled: v })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="notif-sms">{t("sms")}</Label>
            <p className="text-sm text-muted-foreground">{t("smsHint")}</p>
          </div>
          <Switch
            id="notif-sms"
            checked={saved.smsEnabled}
            disabled={busy}
            onCheckedChange={(v) => save({ ...saved, smsEnabled: v, phone: clean(phone) || null })}
          />
        </div>
        <Label htmlFor="notif-phone" className="sr-only">
          {t("phoneLabel")}
        </Label>
        <Input
          id="notif-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t("phonePlaceholder")}
          value={phone}
          disabled={busy}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={savePhone}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into the page and form**

`app/settings/page.tsx`: add imports `import { getCurrentUser } from "@/auth/session";` and `import { getPreferences } from "@/domain/notifications/preferences";`; in `SettingsPage` after `const t = ...` add:

```ts
  const user = await getCurrentUser();
  const prefs = user ? await getPreferences(user.id) : { emailEnabled: false, smsEnabled: false, phone: null };
```

and render `<SettingsForm initialNotifications={prefs} email={user?.email ?? ""} />`.

`components/settings/SettingsForm.tsx`:
- change signature to `export function SettingsForm({ initialNotifications, email }: { initialNotifications: NotificationPreferences; email: string })`
- delete `const [notifications, setNotifications] = useState(true);`
- remove the `Switch` import if now unused
- add `import { NotificationChannels } from "./NotificationChannels";` and `import type { NotificationPreferences } from "@/domain/notifications/preferences";`
- replace the notifications card's `<CardContent>…</CardContent>` with:

```tsx
          <CardContent>
            <NotificationChannels initial={initialNotifications} email={email} />
          </CardContent>
```

- [ ] **Step 5: Tests, typecheck, lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all PASS (including `i18n/messages.test.ts` pl/en parity).

- [ ] **Step 6: Verify in the browser**

Start the dev server with `preview_start`, sign in, open `/settings`. Check:
1. In-app switch is on and disabled.
2. Email switch toggles, shows a toast, and survives a reload.
3. Enabling SMS with an empty phone shows the `phoneInvalid` toast and the switch stays off.
4. Entering `+48 123 456 789`, blur, then enabling SMS persists `+48123456789` (check with `npx prisma studio` or a SQL query).
5. With email enabled and no `RESEND_API_KEY`, registering a package as a receptionist leaves an `email` delivery in `FAILED` with `lastError` "RESEND_API_KEY / EMAIL_FROM not set", while the in-app notification still appears.

- [ ] **Step 7: Commit**

```bash
git add actions/notifications.ts components/settings app/settings/page.tsx messages/pl.json messages/en.json
git commit -m "feat: notification channel preferences in settings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** preferences model (T1), validation and own-row rule (T2), per-user channel resolution with in-app always on (T3), Resend adapter, shared localised copy and status mapping (T4), SMSAPI adapter (T5), after-commit dispatch with cron as sweeper (T6), settings UI, action, i18n (T7). No-audit decision is in Global Constraints.
- **Spec deviation, erasure:** the spec asked to verify person erasure. Checked: `domain/privacy/person.ts` only masks names and there is no erasure code, and the new table cascades on user delete, so no task is needed.
- **Spec deviation, `SMSAPI_SENDER`:** optional instead of required (omitted from the request when unset), since SMSAPI falls back to its default sender.
- **Type consistency:** `NotificationPreferences`, `resolveChannelsByUser`, channel ids `"email"` / `"sms"`, `toResult`, `renderNotification` are named identically wherever used.
- **Known ceilings:** preferences are not per type; deliveries wait until the next `after()` or cron run after a retry backoff; phone is unverified.
