# Admin Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users tab gets building/apartment/email filters and apartment-style cards; Apartments tab loads lazily per floor so a 100-apartment building no longer fetches everything at once.

**Architecture:** Domain layer gains cheap per-floor counts, a per-floor apartment query and a lite apartment list; thin server actions expose the last two to client components. Apartments tab renders collapsed floor sections that fetch on expand. Users tab filters server-side via URL search params.

**Tech Stack:** Next.js 15 (app router, server actions), Prisma, next-intl (`messages/pl.json`, `messages/en.json`), shadcn/ui, vitest against a real DB (`npx vitest run <file>`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-14-admin-usability-design.md`.
- Every domain query calls `requireInviter(actor, communityId)` (apartments) or `requireMembership(actor, communityId, [ADMIN, MANAGER])` (memberships) first, and scopes by `communityId`.
- Names shown to admins keep the existing privacy masking (`maskPerson`); never return emails of masked residents.
- All user-facing strings go through next-intl, added to BOTH `messages/pl.json` and `messages/en.json`.
- Polish floor labels: `null` → "Bez piętra", `0` → "Parter", `n` → "Piętro n".
- Users list pagination and floor editing UI are out of scope.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Floor-aware apartment queries (domain)

**Files:**
- Modify: `domain/residencies/overview.ts` (full rewrite)
- Modify: `domain/residencies/overview.test.ts`

**Interfaces:**
- Produces:
  - `type OverviewFloor = { floor: number | null; total: number; vacant: number }`
  - `type OverviewBuilding = { id: string; name: string; floors: OverviewFloor[] }` (floors sorted ascending, `null` last)
  - `type ApartmentOption = { id: string; number: string; floor: number | null }`
  - `listBuildingFloors(actor: SessionUser, communityId: string): Promise<OverviewBuilding[]>`
  - `listFloorApartments(actor, communityId, buildingId: string, floor: number | null, opts?: { onlyVacant?: boolean }): Promise<OverviewApartment[]>` (throws `NotFoundError` if building not in community)
  - `listApartmentsLite(actor, communityId, buildingId): Promise<ApartmentOption[]>` (sorted by number, numeric)
  - `OverviewResident`, `OverviewApartment` unchanged. `listApartmentOverview` is removed.

- [ ] **Step 1: Rewrite the tests that used `listApartmentOverview`**

In `domain/residencies/overview.test.ts`, change the import to
`import { listApartmentsLite, listBuildingFloors, listFloorApartments } from "@/domain/residencies/overview";`
and `import { NotFoundError, UnauthorizedError } from "@/domain/errors";`, then replace the `describe("listApartmentOverview", ...)` block with:

```ts
describe("listBuildingFloors", () => {
  it("groups by floor with totals and vacancy, null floor last", async () => {
    const s = await scenario(); // 101 + 102, both without floor, both vacant
    const f2 = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "201", floor: 2 } });
    await prisma.apartment.create({ data: { buildingId: s.building.id, number: "202", floor: 2 } });
    await prisma.apartment.create({ data: { buildingId: s.building.id, number: "001", floor: 0 } });
    await createUserWithMembership({ communityId: s.community.id, apartmentId: f2.id, role: Role.RESIDENT });

    const [building] = await listBuildingFloors(s.manager, s.community.id);
    expect(building.floors).toEqual([
      { floor: 0, total: 1, vacant: 1 },
      { floor: 2, total: 2, vacant: 1 },
      { floor: null, total: 2, vacant: 2 },
    ]);
  });

  it("is closed to reception until the community enables it", async () => {
    const s = await scenario();
    await expect(listBuildingFloors(s.reception, s.community.id)).rejects.toThrow(UnauthorizedError);
    await setReceptionCanInvite(s.manager, s.community.id, true);
    await expect(listBuildingFloors(s.reception, s.community.id)).resolves.toHaveLength(1);
  });
});

describe("listFloorApartments", () => {
  it("lists one floor, marks vacant flats and masks residents who hid their name", async () => {
    const s = await scenario();
    const hidden = await createUserWithMembership({ communityId: s.community.id, apartmentId: s.apartment.id, role: Role.RESIDENT, email: "secret@example.com" });
    await prisma.user.update({ where: { id: hidden.id }, data: { firstName: "Jan", lastName: "Tajny", shareName: false } });
    await prisma.apartment.create({ data: { buildingId: s.building.id, number: "201", floor: 2 } });

    const flats = await listFloorApartments(s.manager, s.community.id, s.building.id, null);
    expect(flats.map((a) => a.number)).toEqual(["101", "102"]);
    expect(flats[0].residents[0].name).toBe("Mieszkaniec Building A / 101");
    expect(JSON.stringify(flats)).not.toContain("secret@example.com");
    expect(flats[1].residents).toEqual([]);
  });

  it("onlyVacant drops occupied flats", async () => {
    const s = await scenario();
    await createUserWithMembership({ communityId: s.community.id, apartmentId: s.apartment.id, role: Role.RESIDENT });
    const flats = await listFloorApartments(s.manager, s.community.id, s.building.id, null, { onlyVacant: true });
    expect(flats.map((a) => a.number)).toEqual(["102"]);
  });

  it("rejects a building from another community", async () => {
    const s = await scenario();
    const other = await createCommunityWithBuildingAndApartment();
    await expect(listFloorApartments(s.manager, s.community.id, other.building.id, null)).rejects.toThrow(NotFoundError);
  });
});

describe("listApartmentsLite", () => {
  it("returns id/number/floor sorted numerically", async () => {
    const s = await scenario();
    await prisma.apartment.create({ data: { buildingId: s.building.id, number: "20", floor: 1 } });
    const list = await listApartmentsLite(s.manager, s.community.id, s.building.id);
    expect(list.map((a) => a.number)).toEqual(["20", "101", "102"]);
    expect(list[0]).toEqual({ id: expect.any(String), number: "20", floor: 1 });
  });
});
```

In the `inviteToApartment` describe, replace the overview lookup in "links the invitee, shows them as pending and emails them":

```ts
    const flats = await listFloorApartments(s.manager, s.community.id, s.building.id, null);
    const r = flats.find((a) => a.number === "102")!.residents[0];
```

and grep the rest of the file for any other `listApartmentOverview` use, converting it the same way.

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run domain/residencies/overview.test.ts`
Expected: FAIL (imports not exported).

- [ ] **Step 3: Rewrite `domain/residencies/overview.ts`**

```ts
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { requireInviter, isPendingUser } from "@/domain/memberships/invites";
import { NotFoundError } from "@/domain/errors";
import { maskPerson } from "@/domain/privacy/person";
import type { ResidencyKind } from "@/lib/generated/prisma";

export type OverviewResident = { id: string; name: string; kind: ResidencyKind; pending: boolean };
export type OverviewApartment = { id: string; number: string; floor: number | null; residents: OverviewResident[] };
export type OverviewFloor = { floor: number | null; total: number; vacant: number };
export type OverviewBuilding = { id: string; name: string; floors: OverviewFloor[] };
export type ApartmentOption = { id: string; number: string; floor: number | null };

const byNumber = (x: { number: string }, y: { number: string }) =>
  x.number.localeCompare(y.number, undefined, { numeric: true });

// Floors ascending, flats without a floor last.
const byFloor = (x: { floor: number | null }, y: { floor: number | null }) =>
  x.floor === null ? (y.floor === null ? 0 : 1) : y.floor === null ? -1 : x.floor - y.floor;

// What an apartment row carries. A new Apartment field is added here and in toOverviewApartment only.
const apartmentSelect = (communityId: string) =>
  ({
    id: true,
    number: true,
    floor: true,
    residencies: {
      where: { communityId },
      orderBy: { createdAt: "asc" },
      select: {
        kind: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, shareName: true, clerkUserId: true },
        },
      },
    },
  }) as const;

// Counts only: one cheap call per page load, apartments are fetched per floor on demand.
export async function listBuildingFloors(actor: SessionUser, communityId: string): Promise<OverviewBuilding[]> {
  await requireInviter(actor, communityId);
  const [buildings, totals, occupied] = await Promise.all([
    prisma.building.findMany({ where: { communityId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.apartment.groupBy({ by: ["buildingId", "floor"], where: { building: { communityId } }, _count: { _all: true } }),
    prisma.apartment.groupBy({
      by: ["buildingId", "floor"],
      where: { building: { communityId }, residencies: { some: { communityId } } },
      _count: { _all: true },
    }),
  ]);
  const occupiedBy = new Map(occupied.map((o) => [`${o.buildingId}:${o.floor}`, o._count._all]));

  return buildings.map((b) => ({
    id: b.id,
    name: b.name,
    floors: totals
      .filter((t) => t.buildingId === b.id)
      .map((t) => ({ floor: t.floor, total: t._count._all, vacant: t._count._all - (occupiedBy.get(`${b.id}:${t.floor}`) ?? 0) }))
      .sort(byFloor),
  }));
}

// One floor's flats with who is linked to them. Names follow the app-wide privacy rule:
// someone who hid their name is a placeholder for every viewer (their own row excepted).
export async function listFloorApartments(
  actor: SessionUser,
  communityId: string,
  buildingId: string,
  floor: number | null,
  opts: { onlyVacant?: boolean } = {},
): Promise<OverviewApartment[]> {
  await requireInviter(actor, communityId);
  const building = await prisma.building.findFirst({ where: { id: buildingId, communityId }, select: { name: true } });
  if (!building) throw new NotFoundError(`Building ${buildingId} not found`);

  const rows = await prisma.apartment.findMany({
    where: { buildingId, floor, ...(opts.onlyVacant ? { residencies: { none: { communityId } } } : {}) },
    select: apartmentSelect(communityId),
  });

  return rows
    .map((a) => ({
      id: a.id,
      number: a.number,
      floor: a.floor,
      residents: a.residencies.map(({ kind, user }) => {
        const { clerkUserId, ...person } = user;
        const masked = maskPerson(person, actor.id, { buildingName: building.name, apartmentNumber: a.number });
        return {
          id: person.id,
          name: [masked.firstName, masked.lastName].filter(Boolean).join(" ") || masked.email,
          kind,
          pending: isPendingUser({ clerkUserId }),
        };
      }),
    }))
    .sort(byNumber);
}

// For selects (filters, add-member form): no residents, so cheap even for big buildings.
export async function listApartmentsLite(actor: SessionUser, communityId: string, buildingId: string): Promise<ApartmentOption[]> {
  await requireInviter(actor, communityId);
  const rows = await prisma.apartment.findMany({
    where: { buildingId, building: { communityId } },
    select: { id: true, number: true, floor: true },
  });
  return rows.sort(byNumber);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run domain/residencies/overview.test.ts`
Expected: PASS. (Typecheck errors in `app/admin/apartments/page.tsx` are expected until Task 4.)

- [ ] **Step 5: Commit**

```bash
git add domain/residencies/overview.ts domain/residencies/overview.test.ts
git commit -m "feat: per-floor apartment queries for admin overview

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Membership filters (domain)

**Files:**
- Modify: `domain/memberships/index.ts` (`listMembershipsForCommunity`)
- Modify: `domain/memberships/index.test.ts`

**Interfaces:**
- Produces: `type MembershipFilters = { buildingId?: string; apartmentId?: string; q?: string }` (exported) and `listMembershipsForCommunity(actor, communityId, filters?: MembershipFilters)`.

- [ ] **Step 1: Write failing tests** (append to `domain/memberships/index.test.ts`)

```ts
describe("listMembershipsForCommunity filters", () => {
  async function setup() {
    const s = await createCommunityWithBuildingAndApartment();
    const second = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "102" } });
    const otherBuilding = await prisma.building.create({ data: { communityId: s.community.id, name: "Building B" } });
    const inB = await prisma.apartment.create({ data: { buildingId: otherBuilding.id, number: "1" } });
    const admin = await createUserWithMembership({ communityId: s.community.id, role: Role.ADMIN });
    const a = await createUserWithMembership({ communityId: s.community.id, apartmentId: s.apartment.id, role: Role.RESIDENT, email: "anna@example.com" });
    const b = await createUserWithMembership({ communityId: s.community.id, apartmentId: second.id, role: Role.RESIDENT, email: "bob@example.com" });
    const c = await createUserWithMembership({ communityId: s.community.id, apartmentId: inB.id, role: Role.RESIDENT, email: "cecil@example.com" });
    return { s, second, otherBuilding, admin, a, b, c };
  }
  const emails = (rows: { user: { email: string } }[]) => rows.map((r) => r.user.email).sort();

  it("filters by apartment", async () => {
    const { s, second, admin } = await setup();
    const rows = await listMembershipsForCommunity(admin, s.community.id, { apartmentId: second.id });
    expect(emails(rows)).toEqual(["bob@example.com"]);
  });

  it("filters by building", async () => {
    const { s, admin } = await setup();
    const rows = await listMembershipsForCommunity(admin, s.community.id, { buildingId: s.building.id });
    expect(emails(rows)).toEqual(["anna@example.com", "bob@example.com"]);
  });

  it("filters by email substring, case-insensitive, and combines filters", async () => {
    const { s, admin } = await setup();
    expect(emails(await listMembershipsForCommunity(admin, s.community.id, { q: "CEC" }))).toEqual(["cecil@example.com"]);
    expect(await listMembershipsForCommunity(admin, s.community.id, { buildingId: s.building.id, q: "cecil" })).toEqual([]);
  });

  it("returns everyone without filters", async () => {
    const { s, admin } = await setup();
    expect(await listMembershipsForCommunity(admin, s.community.id)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run domain/memberships/index.test.ts`
Expected: FAIL (filters ignored → wrong rows).

- [ ] **Step 3: Implement**

In `domain/memberships/index.ts` change the signature and `where`:

```ts
export type MembershipFilters = { buildingId?: string; apartmentId?: string; q?: string };

export async function listMembershipsForCommunity(
  actor: SessionUser,
  communityId: string,
  filters: MembershipFilters = {},
) {
  requireMembership(actor, communityId, [Role.ADMIN, Role.MANAGER]);
  const { buildingId, apartmentId, q } = filters;

  const rows = await prisma.membership.findMany({
    where: {
      communityId,
      ...(q ? { user: { email: { contains: q, mode: "insensitive" } } } : {}),
      AND: [
        ...(apartmentId ? [{ user: { residencies: { some: { communityId, apartmentId } } } }] : []),
        ...(buildingId ? [{ user: { residencies: { some: { communityId, apartment: { buildingId } } } } }] : []),
      ],
    },
```

(keep the rest of the `findMany` — `include`, `orderBy` — unchanged).

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run domain/memberships/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/memberships/index.ts domain/memberships/index.test.ts
git commit -m "feat: filter memberships by building, apartment and email

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server actions for on-demand loading

**Files:**
- Create: `actions/apartments.ts`

**Interfaces:**
- Consumes: `listFloorApartments`, `listApartmentsLite` from Task 1.
- Produces:
  - `type LoadResult<T> = { ok: true; data: T } | { ok: false }`
  - `getFloorApartmentsAction(communityId: string, buildingId: string, floor: number | null, onlyVacant: boolean): Promise<LoadResult<OverviewApartment[]>>`
  - `getBuildingApartmentsAction(communityId: string, buildingId: string): Promise<LoadResult<ApartmentOption[]>>`

- [ ] **Step 1: Create `actions/apartments.ts`**

```ts
"use server";

import { z } from "zod";
import { getCurrentUser, type SessionUser } from "@/auth/session";
import { UnauthorizedError, NotFoundError } from "@/domain/errors";
import {
  listApartmentsLite,
  listFloorApartments,
  type ApartmentOption,
  type OverviewApartment,
} from "@/domain/residencies/overview";

export type LoadResult<T> = { ok: true; data: T } | { ok: false };

const id = z.string().min(1).max(64);

// Read-only loaders for admin client components. Failures collapse to { ok: false }; the UI shows a retry hint.
async function load<T>(fn: (actor: SessionUser) => Promise<T>): Promise<LoadResult<T>> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false };
  try {
    return { ok: true, data: await fn(actor) };
  } catch (error) {
    if (!(error instanceof UnauthorizedError || error instanceof NotFoundError)) console.error(error);
    return { ok: false };
  }
}

export async function getFloorApartmentsAction(
  communityId: string,
  buildingId: string,
  floor: number | null,
  onlyVacant: boolean,
): Promise<LoadResult<OverviewApartment[]>> {
  return load((actor) =>
    listFloorApartments(
      actor,
      id.parse(communityId),
      id.parse(buildingId),
      z.number().int().nullable().parse(floor),
      { onlyVacant: z.boolean().parse(onlyVacant) },
    ),
  );
}

export async function getBuildingApartmentsAction(
  communityId: string,
  buildingId: string,
): Promise<LoadResult<ApartmentOption[]>> {
  return load((actor) => listApartmentsLite(actor, id.parse(communityId), id.parse(buildingId)));
}
```

- [ ] **Step 2: Typecheck this file**

Run: `npx tsc --noEmit 2>&1 | grep -E "actions/apartments" || echo clean`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add actions/apartments.ts
git commit -m "feat: server actions to load floor apartments on demand

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Apartments tab — collapsible lazy floors

**Files:**
- Create: `components/admin/useFloorLabel.ts`
- Create: `components/admin/ApartmentRow.tsx`
- Create: `components/admin/FloorSection.tsx`
- Modify: `components/admin/ApartmentsOverview.tsx` (rewrite)
- Modify: `components/admin/InviteToApartmentDialog.tsx` (add `onInvited`)
- Modify: `app/admin/apartments/page.tsx`
- Modify: `messages/pl.json`, `messages/en.json`

**Interfaces:**
- Consumes: `OverviewBuilding`, `OverviewFloor`, `OverviewApartment`, `listBuildingFloors` (Task 1); `getFloorApartmentsAction` (Task 3).
- Produces: `useFloorLabel(): (floor: number | null) => string` (used again in Task 5); `InviteToApartmentDialog` gains optional prop `onInvited?: () => void`, called after a successful invite.

- [ ] **Step 1: Add messages**

`messages/pl.json`, inside `admin`, right after the `"colApartment": "Mieszkanie",` line add:

```json
    "floor": { "none": "Bez piętra", "ground": "Parter", "level": "Piętro {n}" },
```

and inside `admin.apartments`, after `"noneEmpty": ...,` add:

```json
      "loading": "Ładowanie…",
      "loadFailed": "Nie udało się wczytać mieszkań. Zwiń i rozwiń piętro, aby spróbować ponownie.",
```

`messages/en.json`, same places (`"colApartment"` line in `admin`, `"noneEmpty"` in `admin.apartments`):

```json
    "floor": { "none": "No floor", "ground": "Ground floor", "level": "Floor {n}" },
```
```json
      "loading": "Loading…",
      "loadFailed": "Could not load apartments. Collapse and expand the floor to retry.",
```

- [ ] **Step 2: `components/admin/useFloorLabel.ts`**

```ts
import { useTranslations } from "next-intl";

export function useFloorLabel() {
  const t = useTranslations("admin.floor");
  return (floor: number | null) => (floor === null ? t("none") : floor === 0 ? t("ground") : t("level", { n: floor }));
}
```

- [ ] **Step 3: `InviteToApartmentDialog` — add `onInvited`**

Add `onInvited` to props (`onInvited?: () => void;`, destructured) and in the success branch of the effect:

```ts
    if (state.success) {
      toast.success(state.message);
      setOpen(false);
      onInvited?.();
    }
```

(add `onInvited` to the effect's dependency array if lint requires).

- [ ] **Step 4: `components/admin/ApartmentRow.tsx`** (this is the single place an apartment is rendered; future apartment fields get shown here)

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { OverviewApartment } from "@/domain/residencies/overview";
import { InviteToApartmentDialog } from "./InviteToApartmentDialog";

export function ApartmentRow({
  communityId,
  buildingName,
  apartment: a,
  onInvited,
}: {
  communityId: string;
  buildingName: string;
  apartment: OverviewApartment;
  onInvited: () => void;
}) {
  const t = useTranslations("admin.apartments");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1">
        <span className="w-16 font-medium">{a.number}</span>
        {a.residents.length === 0 ? (
          <Badge variant="outline">{t("vacant")}</Badge>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {a.residents.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span>{r.name}</span>
                <Badge variant="secondary">{t(r.kind)}</Badge>
                {r.pending && <Badge variant="outline">{t("pending")}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <InviteToApartmentDialog
        communityId={communityId}
        apartmentId={a.id}
        place={`${buildingName} / ${a.number}`}
        onInvited={onInvited}
      />
    </div>
  );
}
```

- [ ] **Step 5: `components/admin/FloorSection.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Collapse } from "@/components/motion/Collapse";
import { cn } from "@/lib/utils";
import { getFloorApartmentsAction } from "@/actions/apartments";
import type { OverviewApartment, OverviewFloor } from "@/domain/residencies/overview";
import { ApartmentRow } from "./ApartmentRow";
import { useFloorLabel } from "./useFloorLabel";

type Loaded = { onlyEmpty: boolean; apartments: OverviewApartment[] };

// Collapsed by default; the floor's apartments are fetched on first expand and refetched when
// the "only vacant" switch changes or someone is invited (loaded reset to null).
export function FloorSection({
  communityId,
  building,
  floor,
  onlyEmpty,
}: {
  communityId: string;
  building: { id: string; name: string };
  floor: OverviewFloor;
  onlyEmpty: boolean;
}) {
  const t = useTranslations("admin.apartments");
  const floorLabel = useFloorLabel();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || (loaded && loaded.onlyEmpty === onlyEmpty)) return;
    let cancelled = false;
    setFailed(false);
    getFloorApartmentsAction(communityId, building.id, floor.floor, onlyEmpty).then((res) => {
      if (cancelled) return;
      if (res.ok) setLoaded({ onlyEmpty, apartments: res.data });
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, onlyEmpty, loaded, communityId, building.id, floor.floor]);

  const ready = loaded && loaded.onlyEmpty === onlyEmpty;
  const regionId = `floor-${building.id}-${floor.floor ?? "none"}`;

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium">{floorLabel(floor.floor)}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("summary", { total: floor.total, empty: floor.vacant })}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <Collapse show={open}>
        <div id={regionId} className="divide-y border-t pl-4">
          {ready &&
            loaded.apartments.map((a) => (
              <ApartmentRow
                key={a.id}
                communityId={communityId}
                buildingName={building.name}
                apartment={a}
                onInvited={() => setLoaded(null)}
              />
            ))}
          {!ready && !failed && <p className="py-3 text-sm text-muted-foreground">{t("loading")}</p>}
          {failed && <p className="py-3 text-sm text-destructive">{t("loadFailed")}</p>}
        </div>
      </Collapse>
    </section>
  );
}
```

- [ ] **Step 6: Rewrite `components/admin/ApartmentsOverview.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { OverviewBuilding } from "@/domain/residencies/overview";
import { FloorSection } from "./FloorSection";

export function ApartmentsOverview({ communityId, buildings }: { communityId: string; buildings: OverviewBuilding[] }) {
  const t = useTranslations("admin.apartments");
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch id="only-empty" checked={onlyEmpty} onCheckedChange={setOnlyEmpty} />
        <Label htmlFor="only-empty">{t("onlyEmpty")}</Label>
      </div>
      {buildings.length === 0 && <p className="text-sm text-muted-foreground">{t("noBuildings")}</p>}
      {buildings.map((b) => {
        const total = b.floors.reduce((sum, f) => sum + f.total, 0);
        const empty = b.floors.reduce((sum, f) => sum + f.vacant, 0);
        const floors = onlyEmpty ? b.floors.filter((f) => f.vacant > 0) : b.floors;
        return (
          <Card key={b.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{b.name}</CardTitle>
              <span className="text-sm text-muted-foreground">{t("summary", { total, empty })}</span>
            </CardHeader>
            <CardContent className="divide-y">
              {floors.map((f) => (
                <FloorSection
                  key={f.floor ?? "none"}
                  communityId={communityId}
                  building={{ id: b.id, name: b.name }}
                  floor={f}
                  onlyEmpty={onlyEmpty}
                />
              ))}
              {floors.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("noneEmpty")}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Page uses floor counts**

In `app/admin/apartments/page.tsx` replace the import `listApartmentOverview` with `listBuildingFloors` and the call with `await listBuildingFloors(user, membership.communityId)`.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "admin/(apartments|Floor|Apartment|Invite)|actions/apartments" || echo clean` → `clean`.
Run: `npx eslint components/admin app/admin actions` → no errors.
Browser: start dev server (`preview_start`), open `/admin/apartments` as an admin; floors render collapsed with counts; expanding one floor triggers exactly one action call (check network) and shows only its apartments; toggling "only vacant" refetches an expanded floor; inviting refreshes that floor. If the seed data has no floors, set some in the DB (`UPDATE "Apartment" SET floor = ...`) to check grouping and "Bez piętra"/"Parter".

- [ ] **Step 9: Commit**

```bash
git add components/admin app/admin/apartments messages
git commit -m "feat: apartments tab loads floors lazily

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Users tab — filters, cards, on-demand apartments in add form

**Files:**
- Create: `components/admin/MembershipsFilter.tsx`
- Modify: `components/admin/MembershipsTable.tsx`
- Modify: `components/admin/CreateMembershipForm.tsx`
- Modify: `app/admin/users/page.tsx`
- Modify: `messages/pl.json`, `messages/en.json`
- Modify (if now unused): `domain/communities/queries.ts`

**Interfaces:**
- Consumes: `getBuildingApartmentsAction` (Task 3), `useFloorLabel` (Task 4), `ApartmentOption` (Task 1), `listMembershipsForCommunity(actor, communityId, filters)` + `MembershipFilters` (Task 2).
- Produces: `MembershipsFilter` props `{ communityId: string; buildings: { id: string; name: string }[]; buildingId?: string; apartmentId?: string; q?: string }`; `MembershipsTable` gains prop `filtered: boolean`; `CreateMembershipForm` loses `apartmentsByBuilding`.

- [ ] **Step 1: Add messages**

`messages/pl.json`, inside `admin` (next to `"colApartment"`):

```json
    "filterBuilding": "Budynek",
    "allBuildings": "Wszystkie budynki",
    "filterApartment": "Mieszkanie",
    "allApartments": "Wszystkie mieszkania",
    "searchPlaceholder": "Szukaj po e-mailu",
    "searchLabel": "Szukaj",
    "clearFilters": "Wyczyść filtry",
    "emptyFiltered": "Brak członków dla wybranych filtrów",
```

`messages/en.json`, same place:

```json
    "filterBuilding": "Building",
    "allBuildings": "All buildings",
    "filterApartment": "Apartment",
    "allApartments": "All apartments",
    "searchPlaceholder": "Search by email",
    "searchLabel": "Search",
    "clearFilters": "Clear filters",
    "emptyFiltered": "No members match these filters",
```

- [ ] **Step 2: `components/admin/MembershipsFilter.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBuildingApartmentsAction } from "@/actions/apartments";
import type { ApartmentOption } from "@/domain/residencies/overview";
import { useFloorLabel } from "./useFloorLabel";

const ALL = "all";

// Filter state lives in the URL (building, apartment, q) so the server page filters and links are shareable.
export function MembershipsFilter({
  communityId,
  buildings,
  buildingId,
  apartmentId,
  q,
}: {
  communityId: string;
  buildings: { id: string; name: string }[];
  buildingId?: string;
  apartmentId?: string;
  q?: string;
}) {
  const t = useTranslations("admin");
  const floorLabel = useFloorLabel();
  const router = useRouter();
  const pathname = usePathname();
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [query, setQuery] = useState(q ?? "");

  useEffect(() => {
    setApartments([]);
    if (!buildingId) return;
    let cancelled = false;
    getBuildingApartmentsAction(communityId, buildingId).then((res) => {
      if (!cancelled && res.ok) setApartments(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [communityId, buildingId]);

  const go = (next: { building?: string; apartment?: string; q?: string }) => {
    const values = { building: buildingId, apartment: apartmentId, q, ...next };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const active = Boolean(buildingId || apartmentId || q);

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <Select
        value={buildingId ?? ALL}
        onValueChange={(v) => go({ building: v === ALL ? "" : v, apartment: "" })}
      >
        <SelectTrigger className="w-[200px]" aria-label={t("filterBuilding")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allBuildings")}</SelectItem>
          {buildings.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={apartmentId ?? ALL}
        disabled={!buildingId}
        onValueChange={(v) => go({ apartment: v === ALL ? "" : v })}
      >
        <SelectTrigger className="w-[200px]" aria-label={t("filterApartment")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allApartments")}</SelectItem>
          {apartments.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.number}
              {a.floor !== null && ` · ${floorLabel(a.floor)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: query.trim() });
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          maxLength={100}
          className="w-[220px]"
        />
        <Button type="submit" variant="outline" size="icon" aria-label={t("searchLabel")}>
          <Search className="h-4 w-4" />
        </Button>
      </form>
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            router.replace(pathname);
          }}
        >
          <X className="mr-1 h-4 w-4" />
          {t("clearFilters")}
        </Button>
      )}
    </div>
  );
}
```

If `Button` has no `size="icon"` variant, check `components/ui/button.tsx` and use the existing equivalent.

- [ ] **Step 3: `MembershipsTable` → cards**

In `components/admin/MembershipsTable.tsx`:
1. Delete the `Table*` import block; add `import { Card, CardContent } from "@/components/ui/card";`.
2. Change the signature to `({ memberships, filtered = false }: { memberships: MembershipRow[]; filtered?: boolean })`.
3. In the empty branch use `title={filtered ? t("emptyFiltered") : t("empty")}` and `description={filtered ? undefined : t("emptyHint")}` (if `EmptyState` requires `description`, pass `""`... check its props first).
4. Replace the entire final `return (<>...</>)` with:

```tsx
  return (
    <ul className="space-y-3">
      {memberships.map((membership) => (
        <li key={membership.id}>
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="break-all font-medium">
                  {membership.user.email}
                  {pendingBadge(membership)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("colBuilding")}: {membership.building?.name ?? "—"}
                </p>
                <div className="text-sm">{apartments(membership)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {roleSelect(membership, "w-[180px]")}
                {resendButton(membership)}
                {removeButton(membership)}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
```

Remove the now-stale comment about the five columns. Keep every handler/helper above it unchanged. `colEmail`/`colRole`/`colActions` message keys become unused; leave them.

- [ ] **Step 4: `CreateMembershipForm` loads apartments on demand**

In `components/admin/CreateMembershipForm.tsx`:
- Imports: change the last import to `import { ResidencyKind, Role, type Building } from "@/lib/generated/prisma";` and add
  `import { getBuildingApartmentsAction } from "@/actions/apartments";`,
  `import type { ApartmentOption } from "@/domain/residencies/overview";`,
  `import { useFloorLabel } from "./useFloorLabel";`.
- Remove the `apartmentsByBuilding` prop and its type line.
- Add `const floorLabel = useFloorLabel();` and `const [apartments, setApartments] = useState<ApartmentOption[]>([]);`.
- Replace the `useEffect(() => { setApartmentId(""); }, [buildingId]);` effect AND the `const apartments = ...` line with:

```tsx
  useEffect(() => {
    setApartmentId("");
    setApartments([]);
    if (!buildingId) return;
    let cancelled = false;
    getBuildingApartmentsAction(communityId, buildingId).then((res) => {
      if (!cancelled && res.ok) setApartments(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [buildingId, communityId]);
```

- In the apartment `SelectItem`, render `{apartment.number}{apartment.floor !== null && ` · ${floorLabel(apartment.floor)}`}`.

- [ ] **Step 5: Users page**

In `app/admin/users/page.tsx`: drop the `listApartmentsForBuilding` and `Apartment` imports and the `apartmentLists`/`apartmentsByBuilding` block; add `import { MembershipsFilter } from "@/components/admin/MembershipsFilter";`. Replace from `const { invite } = await searchParams;` onward with:

```tsx
  const params = await searchParams;
  const text = (v: string | string[] | undefined, max: number) =>
    typeof v === "string" && v.length <= max ? v : undefined;
  // "Przypisz" on the requests tab lands here with the person's email to prefill the add dialog.
  const invite = text(params.invite, 254);
  const defaultEmail = invite?.includes("@") ? invite : undefined;
  const filters = {
    buildingId: text(params.building, 64),
    apartmentId: text(params.apartment, 64),
    q: text(params.q, 100)?.trim() || undefined,
  };

  const memberships = await listMembershipsForCommunity(user, membership.communityId, filters);
  const buildings = await listBuildingsForCommunity(membership.communityId);

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <CreateMembershipForm
          key={defaultEmail ?? ""}
          defaultEmail={defaultEmail}
          defaultOpen={Boolean(defaultEmail)}
          communityId={membership.communityId}
          buildings={buildings}
        />
      </div>
      <MembershipsFilter
        communityId={membership.communityId}
        buildings={buildings.map(({ id, name }) => ({ id, name }))}
        {...filters}
      />
      <MembershipsTable memberships={memberships} filtered={Object.values(filters).some(Boolean)} />
    </div>
  );
```

(remove the old `// "Przypisz"...` comment above the former `const { invite }` line so it isn't duplicated).

- [ ] **Step 6: Drop dead code**

Run: `grep -rn "listApartmentsForBuilding" --include=*.ts --include=*.tsx . --exclude-dir=node_modules`
If only the definition remains, delete `listApartmentsForBuilding` from `domain/communities/queries.ts`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit` → no errors.
Run: `npx eslint components/admin app/admin actions domain` → no errors.
Run: `npx vitest run` → all pass.
Browser (`preview_start`, `/admin/users`): cards render like apartments tab at desktop and mobile (`resize_window`); choosing a building filters, apartment select enables and lists apartments (one action call), apartment filter narrows to its residents, email search filters, "clear" resets, URL reflects state, a filter with no match shows `emptyFiltered`; the add-member dialog's apartment list loads after picking a building and no apartments are prefetched on page load (network tab).

- [ ] **Step 8: Commit**

```bash
git add components/admin app/admin/users domain/communities/queries.ts messages
git commit -m "feat: users tab filters and card layout, apartments loaded on demand

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: floor counts/lazy floors (T1, T4), lite list (T1, T5), filters server-side (T2, T5), cards (T5), add-form prefetch removed (T5), tests (T1, T2), manual browser check (T4, T5). Out-of-scope items untouched.
- Types: `OverviewFloor`, `ApartmentOption`, `LoadResult`, `MembershipFilters` names are consistent across tasks; `listApartmentOverview` removed in T1 and its only consumer (apartments page) updated in T4, so `tsc` is red between T1 and T4 for that one file only.
