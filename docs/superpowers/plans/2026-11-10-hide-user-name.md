# Hide User Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can turn off sharing of their first/last name; everyone except that user then sees `Mieszkaniec <Building> / <Apt>` instead.

**Architecture:** New `User.shareName` boolean (default true). One pure helper `maskPerson` in `domain/privacy/person.ts` swaps a user's `firstName`/`lastName`/`email` for a placeholder when the viewer is not the user and `shareName` is false. Every domain query that returns another user's identity pipes the result through it server-side, so UI components keep their current shapes and need no change except a new toggle on `/profile`.

**Tech Stack:** Next.js (App Router, server actions), Prisma + Postgres, next-intl, vitest (real DB, `fileParallelism: false`).

## Global Constraints

- Hidden name visible to nobody but the user themself (residents, receptionists, managers, admins all see the placeholder).
- Default `shareName = true` for existing and new users.
- Placeholder: `Mieszkaniec <Building> / <Apt>` using the context apartment; no apartment in context: `Mieszkaniec`. (Spec's staff-role `Pracownik` fallback is dropped: YAGNI, no context needs it.)
- A hidden user's email is masked wherever their name is (email is the current fallback for missing names).
- Staff package search by recipient email must not match hidden users.
- A user's own name (greeting, top bar, nav, profile header) is unchanged.
- Run tests with `npx vitest run <file>`; the test DB is the `DATABASE_URL` in `.env`.

## File Structure

- Create `domain/privacy/person.ts` — `placeholderName`, `maskPerson` (pure).
- Create `domain/privacy/person.test.ts` — unit tests.
- Create `prisma/migrations/20261110120000_add_user_share_name/migration.sql`.
- Modify `prisma/schema.prisma` — `User.shareName`.
- Modify `domain/packages/index.ts`, `domain/residencies/recipients.ts`, `domain/reports/index.ts`, `domain/profile/index.ts` — apply masking; profile gains `setShareName`.
- Create `actions/profile.ts`, `components/profile/ShareNameToggle.tsx`; modify `app/profile/page.tsx`, `messages/en.json`, `messages/pl.json`.

---

### Task 1: Schema and masking helper

**Files:**
- Modify: `prisma/schema.prisma` (model `User`)
- Create: `prisma/migrations/20261110120000_add_user_share_name/migration.sql`
- Create: `domain/privacy/person.ts`
- Test: `domain/privacy/person.test.ts`

**Interfaces:**
- Produces:
  - `type Maskable = { id: string; firstName: string | null; lastName: string | null; email?: string; shareName: boolean }`
  - `type PersonContext = { buildingName?: string | null; apartmentNumber?: string | null }`
  - `placeholderName(ctx?: PersonContext): string`
  - `maskPerson<T extends Maskable>(person: T, viewerId: string, ctx?: PersonContext): T`

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, model `User`, after the `locale String?` line add:

```prisma
  shareName   Boolean  @default(true)
```

Create `prisma/migrations/20261110120000_add_user_share_name/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "shareName" BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 2: Apply and regenerate**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration `20261110120000_add_user_share_name` applied; client regenerated.

- [ ] **Step 3: Write the failing test**

Create `domain/privacy/person.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maskPerson, placeholderName } from "@/domain/privacy/person";

const ctx = { buildingName: "Budynek A", apartmentNumber: "4" };
const user = { id: "u1", firstName: "Jan", lastName: "Kowalski", email: "jan@example.com", shareName: true };

describe("placeholderName", () => {
  it("uses building and apartment when both are known", () => {
    expect(placeholderName(ctx)).toBe("Mieszkaniec Budynek A / 4");
  });
  it("falls back to a generic label", () => {
    expect(placeholderName()).toBe("Mieszkaniec");
    expect(placeholderName({ buildingName: "Budynek A" })).toBe("Mieszkaniec");
    expect(placeholderName({ buildingName: null, apartmentNumber: null })).toBe("Mieszkaniec");
  });
});

describe("maskPerson", () => {
  it("returns a sharing user untouched", () => {
    expect(maskPerson(user, "viewer", ctx)).toBe(user);
  });
  it("returns a hidden user untouched for themself", () => {
    const hidden = { ...user, shareName: false };
    expect(maskPerson(hidden, "u1", ctx)).toBe(hidden);
  });
  it("masks name and email of a hidden user for anyone else", () => {
    const masked = maskPerson({ ...user, shareName: false }, "viewer", ctx);
    expect(masked).toMatchObject({ id: "u1", firstName: "Mieszkaniec Budynek A / 4", lastName: null, email: "" });
  });
  it("does not add an email property when the input has none", () => {
    const { email: _email, ...noEmail } = user;
    const masked = maskPerson({ ...noEmail, shareName: false }, "viewer");
    expect(masked).not.toHaveProperty("email");
    expect(masked.firstName).toBe("Mieszkaniec");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run domain/privacy/person.test.ts`
Expected: FAIL (module `@/domain/privacy/person` not found).

- [ ] **Step 5: Implement**

Create `domain/privacy/person.ts`:

```ts
export type Maskable = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string;
  shareName: boolean;
};

export type PersonContext = { buildingName?: string | null; apartmentNumber?: string | null };

// ponytail: Polish only, domain code has no locale; add i18n if the app ever serves non-Polish communities.
export function placeholderName(ctx?: PersonContext): string {
  if (ctx?.buildingName && ctx.apartmentNumber) {
    return `Mieszkaniec ${ctx.buildingName} / ${ctx.apartmentNumber}`;
  }
  return "Mieszkaniec";
}

// The placeholder goes into firstName so every consumer that already renders
// "first last || email" shows it unchanged. Email is blanked (only when present)
// so the fallback cannot leak the identity.
export function maskPerson<T extends Maskable>(person: T, viewerId: string, ctx?: PersonContext): T {
  if (person.shareName || person.id === viewerId) return person;
  return {
    ...person,
    firstName: placeholderName(ctx),
    lastName: null,
    ...("email" in person ? { email: "" } : {}),
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run domain/privacy/person.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261110120000_add_user_share_name domain/privacy
git commit -m "feat: add User.shareName and maskPerson helper"
```

---

### Task 2: Mask package recipients

**Files:**
- Modify: `domain/packages/index.ts` (`listPackagesForViewer`, lines ~127-190; imports at top)
- Test: `domain/packages/index.test.ts` (append to the describe containing "does not expose the recipient's email", which has a `setup()` returning `{community, building, apartment, owner, tenant, receptionist}`)

**Interfaces:**
- Consumes: `maskPerson`, `Maskable` from `@/domain/privacy/person` (Task 1).
- Produces: `listPackagesForViewer` returns recipients with masked `firstName`/`lastName`/`email` for hidden users.

- [ ] **Step 1: Write the failing test**

Add inside the same `describe` as the email-exposure test:

```ts
  it("masks a hidden recipient for staff and other residents, but not for themself", async () => {
    const s = await setup();
    await prisma.apartmentResidency.updateMany({ where: { userId: s.owner.id }, data: { isPrimary: true } });
    await prisma.user.update({
      where: { id: s.owner.id },
      data: { firstName: "Jan", lastName: "Kowalski", shareName: false },
    });
    await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });

    const placeholder = "Mieszkaniec Building A / 101";
    const [asStaff] = await listPackagesForViewer(s.receptionist, s.community.id);
    expect(asStaff.recipient).toMatchObject({ firstName: placeholder, lastName: null, email: "" });

    const [asTenant] = await listPackagesForViewer(s.tenant, s.community.id);
    expect(asTenant.recipient).toMatchObject({ firstName: placeholder, lastName: null });

    const [asOwner] = await listPackagesForViewer(s.owner, s.community.id);
    expect(asOwner.recipient).toMatchObject({ firstName: "Jan", lastName: "Kowalski" });
  });

  it("does not let staff find a hidden recipient by email search", async () => {
    const s = await setup();
    await prisma.apartmentResidency.updateMany({ where: { userId: s.owner.id }, data: { isPrimary: true } });
    await prisma.user.update({ where: { id: s.owner.id }, data: { shareName: false } });
    await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });

    const found = await listPackagesForViewer(s.receptionist, s.community.id, { search: s.owner.email });
    expect(found).toHaveLength(0);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run domain/packages/index.test.ts`
Expected: the two new tests FAIL (names unmasked / package found).

- [ ] **Step 3: Implement**

In `domain/packages/index.ts` add the import:

```ts
import { maskPerson, type Maskable } from "@/domain/privacy/person";
```

Above `listPackagesForViewer` add:

```ts
function maskRecipient(viewerId: string) {
  return <P extends { recipient: Maskable | null; apartment: { number: string }; building: { name: string } }>(
    pkg: P,
  ): P =>
    pkg.recipient
      ? {
          ...pkg,
          recipient: maskPerson(pkg.recipient, viewerId, {
            buildingName: pkg.building.name,
            apartmentNumber: pkg.apartment.number,
          }),
        }
      : pkg;
}
```

Change the email search clause to skip hidden users:

```ts
            ? [{ recipient: { email: { contains: search, mode: "insensitive" as const }, shareName: true } }]
```

Staff branch: replace `return prisma.package.findMany({ ... })` with

```ts
    const rows = await prisma.package.findMany({
      where: { communityId, ...searchFilter },
      include: {
        apartment: true,
        building: true,
        recipient: { select: { id: true, firstName: true, lastName: true, email: true, shareName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(maskRecipient(actor.id));
```

Resident branch: same pattern, `recipient: { select: { id: true, firstName: true, lastName: true, shareName: true } }`, assign to `rows`, `return rows.map(maskRecipient(actor.id));`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run domain/packages`
Expected: PASS (existing email-exposure test still passes: resident recipient has no `email`, staff has).

- [ ] **Step 5: Commit**

```bash
git add domain/packages/index.ts domain/packages/index.test.ts
git commit -m "feat: mask hidden package recipients"
```

---

### Task 3: Mask recipient picker

**Files:**
- Modify: `domain/residencies/recipients.ts`
- Test: `domain/residencies/recipients.test.ts` (uses `owner`, `tenant`, `receptionist`, `community`, `apartment` set up in `beforeEach`)

**Interfaces:**
- Consumes: `maskPerson` (Task 1).

- [ ] **Step 1: Write the failing test**

Add inside the top-level `describe` of `recipients.test.ts` (after its `beforeEach`; if the file declares the actor under another name, use that):

```ts
  it("shows a placeholder for a hidden resident", async () => {
    await prisma.user.update({
      where: { id: owner.id },
      data: { firstName: "Jan", lastName: "Kowalski", shareName: false },
    });

    const result = await getPackageRecipientOptions(receptionist, community.id, apartment.id);

    const names = result.options.map((o) => o.name);
    expect(names).toContain("Mieszkaniec Building A / 101");
    expect(names.join(" ")).not.toContain("Jan");
    expect(names.join(" ")).not.toContain(owner.email);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run domain/residencies/recipients.test.ts`
Expected: FAIL (name is "Jan Kowalski").

- [ ] **Step 3: Implement**

In `domain/residencies/recipients.ts` add `import { maskPerson } from "@/domain/privacy/person";`, then inside `getPackageRecipientOptions` after `links` is loaded:

```ts
  const ctx = { buildingName: apartment.building.name, apartmentNumber: apartment.number };
  const nameOf = (u: (typeof links)[number]["user"]) => displayName(maskPerson(u, actor.id, ctx));

  const options = links.map((l) => ({ userId: l.userId, name: nameOf(l.user), kind: l.kind }));
  const primary = links.find((l) => l.isPrimary);
  return {
    default: primary
      ? { type: "primary", userId: primary.userId, name: nameOf(primary.user) }
      : { type: "all" },
    options,
  };
```

(Remove the old `options`/`primary`/`return` lines it replaces.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run domain/residencies/recipients.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/residencies
git commit -m "feat: mask hidden residents in recipient picker"
```

---

### Task 4: Mask report authors

**Files:**
- Modify: `domain/reports/index.ts` (`reportInclude`, `maskAuthor`, imports)
- Modify: `domain/reports/index.test.ts:212` (existing expectation gains `shareName`)
- Test: `domain/reports/index.test.ts`

**Interfaces:**
- Consumes: `maskPerson` (Task 1).
- Produces: `ReportListItem["author"]` is `{ firstName; lastName; email; shareName }`.

- [ ] **Step 1: Write the failing test**

Look at how the test near line 212 creates a report (`asResident`, `byId`, a staff actor). Add a sibling test that reuses the same fixtures: create a report authored by a resident whose `shareName` is false, then list as staff.

```ts
  it("masks a hidden author for staff", async () => {
    // reuse the same setup as the neighbouring author-masking test
    await prisma.user.update({
      where: { id: author.id },
      data: { firstName: "Jan", lastName: "Kowalski", shareName: false },
    });

    const asStaff = await listReports(staff, community.id);

    const item = asStaff.find((r) => r.id === report.id)!;
    expect(item.author.firstName).toMatch(/^Mieszkaniec/);
    expect(item.author.lastName).toBeNull();
    expect(item.author.email).toBe("");
  });
```

Adapt `author`, `staff`, `community`, `report` to the variable names used by the neighbouring test (read the test at line ~190-215 first).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run domain/reports/index.test.ts`
Expected: new test FAILS (author unmasked).

- [ ] **Step 3: Implement**

Import `maskPerson`. In `reportInclude` change author select to `{ firstName: true, lastName: true, email: true, shareName: true }`. Replace `maskAuthor`:

```ts
// Residents must not receive other authors' identity (it would ship in the RSC payload).
// Staff see real identities unless the author opted out of sharing their name.
function maskAuthor<T extends ReportListItem>(report: T, actor: SessionUser, isStaff: boolean): T {
  if (report.authorId === actor.id) return report;
  if (!isStaff) {
    return { ...report, author: { firstName: null, lastName: null, email: "", shareName: true } };
  }
  return {
    ...report,
    author: maskPerson({ id: report.authorId, ...report.author }, actor.id, {
      buildingName: report.building?.name,
      apartmentNumber: report.apartment?.number,
    }),
  };
}
```

Update the existing expectation at `domain/reports/index.test.ts:212` to
`{ firstName: null, lastName: null, email: "", shareName: true }`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run domain/reports`
Expected: PASS. Then `npx tsc --noEmit` — expected: no new errors (checks `createReport`/other callers of `reportInclude`).

- [ ] **Step 5: Commit**

```bash
git add domain/reports
git commit -m "feat: mask hidden report authors for staff"
```

---

### Task 5: Mask profile people and add `setShareName`

**Files:**
- Modify: `domain/profile/index.ts`
- Test: `domain/profile/index.test.ts` (existing test near line 116 builds an owner + tenant with names; mimic it)

**Interfaces:**
- Consumes: `maskPerson` (Task 1).
- Produces: `setShareName(actor: SessionUser, share: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `domain/profile/index.test.ts` (imports: add `setShareName` to the `@/domain/profile` import; `createUserWithMembership` accepts `kind`):

```ts
describe("name privacy", () => {
  async function pair() {
    const { community, building, apartment } = await createCommunityWithBuildingAndApartment();
    const owner = await createUserWithMembership({
      communityId: community.id, buildingId: building.id, apartmentId: apartment.id, role: Role.RESIDENT, kind: "OWNER",
    });
    const tenant = await createUserWithMembership({
      communityId: community.id, buildingId: building.id, apartmentId: apartment.id, role: Role.RESIDENT, kind: "TENANT",
    });
    return { community, owner, tenant };
  }

  it("masks a hidden co-resident's name and email, even for the owner", async () => {
    const { community, owner, tenant } = await pair();
    await prisma.user.update({ where: { id: tenant.id }, data: { firstName: "Tina", lastName: "Tenant", shareName: false } });

    const profile = await getProfile(owner, community.id);

    const person = profile.apartments[0].people.find((p) => !p.isMe)!;
    expect(person.name).toBe("Mieszkaniec Building A / 101");
    expect(person.email).toBeNull();
  });

  it("still shows the user their own name", async () => {
    const { community, owner } = await pair();
    await prisma.user.update({ where: { id: owner.id }, data: { firstName: "Olga", lastName: "Owner", shareName: false } });

    const profile = await getProfile({ ...owner, firstName: "Olga", lastName: "Owner", shareName: false }, community.id);

    expect(profile.apartments[0].people.find((p) => p.isMe)!.name).toBe("Olga Owner");
  });

  it("setShareName updates only the actor", async () => {
    const { owner, tenant } = await pair();
    await setShareName(owner, false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).shareName).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: tenant.id } })).shareName).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run domain/profile/index.test.ts`
Expected: FAIL (`setShareName` is not a function / names unmasked).

- [ ] **Step 3: Implement**

In `domain/profile/index.ts` import `maskPerson`, and replace the `people:` mapping body:

```ts
        people: aptLinks.map((l) => {
          const u = maskPerson(l.user, actor.id, { buildingName: a.building.name, apartmentNumber: a.number });
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
          return {
            residencyId: l.id,
            // Owners see everyone's email; tenants only see names (null when unnamed).
            name: fullName || (iAmOwner ? u.email : null),
            email: iAmOwner ? u.email || null : null,
            kind: l.kind,
            isPrimary: l.isPrimary,
            receivesPackages: l.receivesPackages,
            livesHere: livesHere(l, hasTenant),
            isMe: l.userId === actor.id,
          };
        }),
```

Add at the end of the file:

```ts
export async function setShareName(actor: SessionUser, share: boolean): Promise<void> {
  await prisma.user.update({ where: { id: actor.id }, data: { shareName: share } });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run domain/profile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/profile
git commit -m "feat: mask hidden co-residents on profile, add setShareName"
```

---

### Task 6: Settings toggle on /profile

**Files:**
- Create: `actions/profile.ts`
- Create: `components/profile/ShareNameToggle.tsx`
- Modify: `app/profile/page.tsx` (render toggle under the header block)
- Modify: `messages/en.json`, `messages/pl.json` (inside `"profile"`)

**Interfaces:**
- Consumes: `setShareName` (Task 5), `getCurrentUser`.
- Produces: `setShareNameAction(share: boolean): Promise<{ message: string; success: boolean }>`.

- [ ] **Step 1: Messages**

In `messages/en.json`, inside `"profile"` right before `"apartmentCard": "Apartment",` add:

```json
    "privacy": {
      "shareName": "Show my name to others",
      "shareNameHint": "When off, neighbours and staff see \"Mieszkaniec\" with your building and apartment instead of your name and email.",
      "saved": "Saved",
      "failed": "Could not save the change"
    },
```

In `messages/pl.json`, inside `"profile"` right before `"apartmentCard":` add (confirm the key exists first with `grep -n '"apartmentCard"' messages/pl.json`):

```json
    "privacy": {
      "shareName": "Pokazuj moje imię i nazwisko innym",
      "shareNameHint": "Po wyłączeniu sąsiedzi i pracownicy zobaczą \"Mieszkaniec\" z Twoim budynkiem i mieszkaniem zamiast imienia, nazwiska i emaila.",
      "saved": "Zapisano",
      "failed": "Nie udało się zapisać zmiany"
    },
```

- [ ] **Step 2: Server action**

Create `actions/profile.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { setShareName } from "@/domain/profile";

type ActionState = { message: string; success: boolean };

export async function setShareNameAction(share: boolean): Promise<ActionState> {
  const t = await getTranslations("profile.privacy");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await setShareName(actor, share);
    // Names appear on packages, reports and profile pages for other viewers.
    revalidatePath("/", "layout");
    return { message: t("saved"), success: true };
  } catch (error) {
    console.error(error);
    return { message: t("failed"), success: false };
  }
}
```

- [ ] **Step 3: Toggle component**

Create `components/profile/ShareNameToggle.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setShareNameAction } from "@/actions/profile";

export function ShareNameToggle({ initial }: { initial: boolean }) {
  const t = useTranslations("profile.privacy");
  const [checked, setChecked] = useState(initial);
  const [busy, setBusy] = useState(false);

  const change = async (next: boolean) => {
    setBusy(true);
    setChecked(next);
    try {
      const result = await setShareNameAction(next);
      if (result.success) toast.success(result.message);
      else {
        setChecked(!next);
        toast.error(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3">
      <Switch id="share-name" checked={checked} disabled={busy} onCheckedChange={change} />
      <div className="space-y-1">
        <Label htmlFor="share-name">{t("shareName")}</Label>
        <p className="text-sm text-muted-foreground">{t("shareNameHint")}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render on the profile page**

In `app/profile/page.tsx` import `ShareNameToggle from "@/components/profile/ShareNameToggle"` and add, as a new `StaggerItem` directly after the header `StaggerItem` (index 0) — bump nothing else, reuse index 0 is wrong, so use a plain wrapper instead:

```tsx
      <div>
        <ShareNameToggle initial={user.shareName} />
      </div>
```

placed between the header `</StaggerItem>` and the `<div className="grid gap-4 md:grid-cols-2">`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no type/lint errors; full suite PASS.
Then start the dev server (preview), open `/profile`, flip the switch, confirm a toast and that the value persists after reload.

- [ ] **Step 6: Commit**

```bash
git add actions/profile.ts components/profile/ShareNameToggle.tsx app/profile/page.tsx messages
git commit -m "feat: profile toggle to hide name from others"
```

---

## Self-Review

- Spec coverage: data + toggle (Tasks 1, 6); packages incl. email search (2); picker (3); reports (4); profile people + owner-email rule (5); own name unchanged (no task touches Clerk-based UI); tests per domain (2-5) plus helper unit tests (1). Spec's staff `Pracownik` fallback dropped, stated in Global Constraints.
- Types: `maskPerson`/`Maskable`/`PersonContext` names identical across tasks; `setShareName` defined in Task 5, used in Task 6.
