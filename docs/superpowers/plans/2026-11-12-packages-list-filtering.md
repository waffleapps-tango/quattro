# Packages List Filtering, Sorting, Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reception can filter, sort and page the packages table (default: only not-yet-picked-up packages), and can tell masked residents apart in the "Zarejestruj paczkę" recipient picker.

**Architecture:** A pure `parsePackageQuery` turns URL search params into a validated `PackageQuery`. `listPackagesForViewer` takes that query and returns `{ items, total, page, pageSize }` using one Prisma `where` for both `count` and `findMany`. The `/packages` page parses the URL and renders a toolbar, sortable headers and pagination that all write back to the URL through one small hook. Recipient options gain `masked` and `since` so the modal can label masked people.

**Tech Stack:** Next.js 15 (App Router, server components), Prisma 6 + Postgres, next-intl, Radix/shadcn UI in `components/ui`, vitest.

Spec: `docs/superpowers/specs/2026-11-12-packages-list-filtering-design.md`

## Global Constraints

- Page size is the constant `PACKAGE_PAGE_SIZE = 20`.
- Default query: `status=open` ("Tylko nieodebrane" on), `sort=received`, `dir=desc`, `page=1`.
- URL params: `q`, `building`, `apartment`, `recipient`, `status` (`open`|`all`), `sort` (`received`|`apartment`|`status`), `dir` (`asc`|`desc`), `page`. Invalid values fall back to defaults. Defaults are omitted from the URL.
- Residents: only `status`, `sort`, `dir`, `page` (and `q`) apply; `building`, `apartment`, `recipient` are ignored. A resident's access filter is always ANDed, never replaced.
- Recipient filter matches only users with `shareName = true`; masked users are never matchable.
- Privacy unchanged: masked residents stay masked for staff. Hints only.
- Every user-visible string goes into both `messages/pl.json` and `messages/en.json`.
- **Tests wipe the database** (`cleanupDatabase`). Run vitest only against the local Docker Postgres (`.env` `DATABASE_URL=...localhost:5432/quattro`). Never run tests with `.env.gcp` loaded.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `domain/packages/query.ts` (create) | `PackageQuery` type, constants, `parsePackageQuery` |
| `domain/packages/query.test.ts` (create) | Unit tests for the parser (no DB) |
| `domain/packages/index.ts` (modify) | `listPackagesForViewer` returns a page, builds where/orderBy |
| `domain/packages/index.test.ts` (modify) | Existing tests adapted + new filter/sort/pagination tests |
| `domain/packages/tenant-isolation.test.ts` (modify) | Adapt to new return shape |
| `app/packages/page.tsx` (modify) | Parse URL, load page, pass props |
| `components/packages/use-package-params.ts` (create) | Hook that writes a patch into the URL |
| `components/packages/PackagesToolbar.tsx` (create) | Search, status switch, staff filters, mobile sort select |
| `components/packages/PackagesPagination.tsx` (create) | Summary + prev/next |
| `components/packages/PackagesList.tsx` (modify) | Sortable headers, empty states, compose toolbar/pagination |
| `domain/residencies/recipients.ts` (modify) | Options gain `masked`, `since` |
| `domain/residencies/recipients.test.ts` (modify) | Test for new fields |
| `components/packages/CreatePackageForm.tsx` (modify) | Masked labels with relationship and month |
| `messages/pl.json`, `messages/en.json` (modify) | New strings |

---

### Task 1: Query parser

**Files:**
- Create: `domain/packages/query.ts`
- Test: `domain/packages/query.test.ts`

**Interfaces:**
- Produces:
  - `export const PACKAGE_PAGE_SIZE = 20`
  - `export const PACKAGE_SORTS = ["received", "apartment", "status"] as const`
  - `export type PackageSort`, `export type PackageQuery = { q: string; building: string; apartment: string; recipient: string; status: "open" | "all"; sort: PackageSort; dir: "asc" | "desc"; page: number }`
  - `export function parsePackageQuery(raw?: Record<string, string | string[] | undefined>): PackageQuery`

- [ ] **Step 1: Write the failing test** — create `domain/packages/query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePackageQuery } from "@/domain/packages/query";

describe("parsePackageQuery", () => {
  it("returns the defaults for no params", () => {
    expect(parsePackageQuery()).toEqual({
      q: "",
      building: "",
      apartment: "",
      recipient: "",
      status: "open",
      sort: "received",
      dir: "desc",
      page: 1,
    });
  });

  it("reads valid params", () => {
    expect(
      parsePackageQuery({
        q: " TRK1 ",
        building: "b1",
        apartment: "20",
        recipient: "jan",
        status: "all",
        sort: "apartment",
        dir: "asc",
        page: "3",
      }),
    ).toEqual({
      q: "TRK1",
      building: "b1",
      apartment: "20",
      recipient: "jan",
      status: "all",
      sort: "apartment",
      dir: "asc",
      page: 3,
    });
  });

  it("falls back to defaults for invalid values", () => {
    const q = parsePackageQuery({ status: "nope", sort: "drop table", dir: "up", page: "-4" });
    expect(q.status).toBe("open");
    expect(q.sort).toBe("received");
    expect(q.dir).toBe("desc");
    expect(q.page).toBe(1);
    expect(parsePackageQuery({ page: "abc" }).page).toBe(1);
  });

  it("takes the first value of a repeated param and caps text length", () => {
    expect(parsePackageQuery({ sort: ["status", "apartment"] }).sort).toBe("status");
    expect(parsePackageQuery({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run domain/packages/query.test.ts`
Expected: FAIL, cannot resolve `@/domain/packages/query`.

- [ ] **Step 3: Implement** — create `domain/packages/query.ts`:

```ts
export const PACKAGE_PAGE_SIZE = 20;
export const PACKAGE_SORTS = ["received", "apartment", "status"] as const;
export type PackageSort = (typeof PACKAGE_SORTS)[number];

export type PackageQuery = {
  q: string;
  building: string;
  apartment: string;
  recipient: string;
  status: "open" | "all";
  sort: PackageSort;
  dir: "asc" | "desc";
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const text = (v: string | string[] | undefined) => (first(v) ?? "").trim().slice(0, 100);

// Single place where untrusted URL params become a PackageQuery.
export function parsePackageQuery(raw: RawParams = {}): PackageQuery {
  const page = Number.parseInt(first(raw.page) ?? "", 10);
  return {
    q: text(raw.q),
    building: text(raw.building),
    apartment: text(raw.apartment),
    recipient: text(raw.recipient),
    status: first(raw.status) === "all" ? "all" : "open",
    sort: PACKAGE_SORTS.find((s) => s === first(raw.sort)) ?? "received",
    dir: first(raw.dir) === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run domain/packages/query.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add domain/packages/query.ts domain/packages/query.test.ts
git commit -m "feat: parse package list URL params into a validated query"
```

---

### Task 2: Domain query with filters, sorting and pagination

**Files:**
- Modify: `domain/packages/index.ts` (`listPackagesForViewer`, lines ~143-end of that function)
- Modify: `domain/packages/index.test.ts`, `domain/packages/tenant-isolation.test.ts` (adapt call sites)
- Test: `domain/packages/index.test.ts`

**Interfaces:**
- Consumes: `PackageQuery`, `PACKAGE_PAGE_SIZE`, `parsePackageQuery` from Task 1.
- Produces: `listPackagesForViewer(actor: SessionUser, communityId: string, query?: PackageQuery): Promise<{ items: PackageRow[]; total: number; page: number; pageSize: number }>` where `query` defaults to `parsePackageQuery()`. `page` is the effective page (clamped to the last page).

- [ ] **Step 1: Make sure the local test DB is up**

Run: `docker ps --format '{{.Names}}' | grep postgres && grep '^DATABASE_URL' .env`
Expected: `quattro-postgres-1` listed and `DATABASE_URL` containing `localhost:5432`. If not, `docker compose up -d postgres` and `npx prisma migrate deploy`. Stop if `.env` points anywhere but localhost.

- [ ] **Step 2: Write the failing tests** — append to `domain/packages/index.test.ts` (add `parsePackageQuery` import: `import { parsePackageQuery } from "@/domain/packages/query";`):

```ts
describe("listPackagesForViewer filters, sorting and pagination", () => {
  async function seed() {
    const s = await createPackageScenario(); // Building A, apartment 101, receptionist, resident (apt 101)
    const buildingB = await prisma.building.create({
      data: { communityId: s.community.id, name: "Building B" },
    });
    const apt202 = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "202" } });
    const aptB1 = await prisma.apartment.create({ data: { buildingId: buildingB.id, number: "1" } });
    const make = (
      apartmentId: string,
      buildingId: string,
      extra: { recipientUserId?: string; trackingNumber?: string; courier?: string } = {},
    ) =>
      createPackage(s.receptionist, { communityId: s.community.id, buildingId, apartmentId, ...extra });
    return { ...s, buildingB, apt202, aptB1, make };
  }
  const ids = (r: { items: { id: string }[] }) => r.items.map((p) => p.id);

  it("hides picked-up packages by default and shows them with status=all", async () => {
    const s = await seed();
    const open = await s.make(s.apartment.id, s.building.id);
    const done = await s.make(s.apartment.id, s.building.id);
    await markPickedUp(s.receptionist, done.id);

    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id))).toEqual([open.id]);
    const all = await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ status: "all" }));
    expect(ids(all).sort()).toEqual([open.id, done.id].sort());
    expect(all.total).toBe(2);
  });

  it("filters by building and by apartment number (contains)", async () => {
    const s = await seed();
    const a101 = await s.make(s.apartment.id, s.building.id);
    const a202 = await s.make(s.apt202.id, s.building.id);
    const b1 = await s.make(s.aptB1.id, s.buildingB.id);

    const byBuilding = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ building: s.buildingB.id }),
    );
    expect(ids(byBuilding)).toEqual([b1.id]);

    const byApartment = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ apartment: "20" }),
    );
    expect(ids(byApartment)).toEqual([a202.id]);
    expect(ids(byApartment)).not.toContain(a101.id);
  });

  it("filters by recipient name or email, and never matches a masked recipient", async () => {
    const s = await seed();
    await prisma.user.update({
      where: { id: s.resident.id },
      data: { firstName: "Jan", lastName: "Kowalski" },
    });
    const pkg = await s.make(s.apartment.id, s.building.id, { recipientUserId: s.resident.id });
    await s.make(s.apt202.id, s.building.id);

    const byName = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ recipient: "jan kow" }),
    );
    expect(ids(byName)).toEqual([pkg.id]);

    await prisma.user.update({ where: { id: s.resident.id }, data: { shareName: false } });
    const masked = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ recipient: "jan" }),
    );
    expect(masked.items).toHaveLength(0);
  });

  it("searches q across tracking number and courier", async () => {
    const s = await seed();
    const byTracking = await s.make(s.apartment.id, s.building.id, { trackingNumber: "ABC123" });
    const byCourier = await s.make(s.apt202.id, s.building.id, { courier: "InPost" });
    await s.make(s.aptB1.id, s.buildingB.id, { trackingNumber: "ZZZ" });

    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ q: "abc" })))).toEqual([byTracking.id]);
    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ q: "inpost" })))).toEqual([byCourier.id]);
  });

  it("sorts by apartment (building name, then number) in both directions", async () => {
    const s = await seed();
    const b1 = await s.make(s.aptB1.id, s.buildingB.id);
    const a202 = await s.make(s.apt202.id, s.building.id);
    const a101 = await s.make(s.apartment.id, s.building.id);

    const asc = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ sort: "apartment", dir: "asc" }),
    );
    expect(ids(asc)).toEqual([a101.id, a202.id, b1.id]);
    const desc = await listPackagesForViewer(
      s.receptionist, s.community.id, parsePackageQuery({ sort: "apartment", dir: "desc" }),
    );
    expect(ids(desc)).toEqual([b1.id, a202.id, a101.id]);
  });

  it("sorts by received date, newest first by default", async () => {
    const s = await seed();
    const old = await s.make(s.apartment.id, s.building.id);
    const mid = await s.make(s.apt202.id, s.building.id);
    const recent = await s.make(s.aptB1.id, s.buildingB.id);
    const day = 24 * 60 * 60 * 1000;
    for (const [pkg, ago] of [[old, 10], [mid, 5], [recent, 1]] as const) {
      await prisma.package.update({ where: { id: pkg.id }, data: { receivedAt: new Date(Date.now() - ago * day) } });
    }

    expect(ids(await listPackagesForViewer(s.receptionist, s.community.id))).toEqual([recent.id, mid.id, old.id]);
    const asc = await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ dir: "asc" }));
    expect(ids(asc)).toEqual([old.id, mid.id, recent.id]);
  });

  it("paginates 20 per page and clamps a page past the end", async () => {
    const s = await seed();
    await prisma.package.createMany({
      data: Array.from({ length: 25 }, () => ({
        communityId: s.community.id,
        buildingId: s.building.id,
        apartmentId: s.apartment.id,
        receivedById: s.receptionist.id,
      })),
    });

    const p1 = await listPackagesForViewer(s.receptionist, s.community.id);
    expect([p1.items.length, p1.total, p1.page, p1.pageSize]).toEqual([20, 25, 1, 20]);
    const p2 = await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ page: "2" }));
    expect([p2.items.length, p2.page]).toEqual([5, 2]);
    const far = await listPackagesForViewer(s.receptionist, s.community.id, parsePackageQuery({ page: "99" }));
    expect([far.items.length, far.page]).toEqual([5, 2]);
    expect(new Set([...ids(p1), ...ids(p2)]).size).toBe(25);
  });

  it("keeps a resident to their own apartment whatever the params say", async () => {
    const s = await seed();
    const own = await s.make(s.apartment.id, s.building.id);
    await s.make(s.apt202.id, s.building.id);
    await s.make(s.aptB1.id, s.buildingB.id);

    const result = await listPackagesForViewer(
      s.resident,
      s.community.id,
      parsePackageQuery({ building: s.buildingB.id, apartment: "202", recipient: "x", status: "all" }),
    );
    expect(ids(result)).toEqual([own.id]);
    expect(result.total).toBe(1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run domain/packages/index.test.ts -t "filters, sorting and pagination"`
Expected: FAIL (type/shape errors; function still takes `{ search }` and returns an array).

- [ ] **Step 4: Replace `listPackagesForViewer`** in `domain/packages/index.ts`. Add imports at the top: `import { PACKAGE_PAGE_SIZE, parsePackageQuery, type PackageQuery } from "@/domain/packages/query";`. Replace the whole existing `listPackagesForViewer` function (from `export async function listPackagesForViewer(` to its closing brace) with:

```ts
function packageOrderBy(q: PackageQuery): Prisma.PackageOrderByWithRelationInput[] {
  // ponytail: apartment numbers are strings, so "10" sorts before "2"; add a numeric column if it matters.
  switch (q.sort) {
    case "apartment":
      return [{ building: { name: q.dir } }, { apartment: { number: q.dir } }, { receivedAt: "desc" }, { id: "asc" }];
    case "status":
      return [{ status: q.dir }, { receivedAt: "desc" }, { id: "asc" }];
    default:
      return [{ receivedAt: q.dir }, { id: "asc" }];
  }
}

export async function listPackagesForViewer(
  actor: SessionUser,
  communityId: string,
  query: PackageQuery = parsePackageQuery(),
) {
  const staff = actor.memberships.some(
    (m) => m.communityId === communityId && STAFF_ROLES.includes(m.role),
  );
  if (!staff && !actor.memberships.some((m) => m.communityId === communityId)) {
    throw new UnauthorizedError(`User ${actor.id} has no membership in community ${communityId}`);
  }

  const and: Prisma.PackageWhereInput[] = [];

  if (!staff) {
    const access: Prisma.PackageWhereInput[] = [{ recipientUserId: actor.id }];
    const apartmentIds = residentApartmentIds(actor, communityId);
    if (apartmentIds.length > 0) access.push({ apartmentId: { in: apartmentIds } });
    and.push({ OR: access });
  }

  if (query.status === "open") and.push({ status: { not: PackageStatus.PICKED_UP } });

  if (query.q) {
    and.push({
      OR: [
        { trackingNumber: { contains: query.q, mode: "insensitive" } },
        { courier: { contains: query.q, mode: "insensitive" } },
        { apartment: { number: { contains: query.q, mode: "insensitive" } } },
        // Residents must not be able to probe co-residents' emails through search.
        ...(staff
          ? [{ recipient: { email: { contains: query.q, mode: "insensitive" as const }, shareName: true } }]
          : []),
      ],
    });
  }

  if (staff) {
    if (query.building) and.push({ buildingId: query.building });
    if (query.apartment) {
      and.push({ apartment: { number: { contains: query.apartment, mode: "insensitive" } } });
    }
    const terms = query.recipient.split(/\s+/).filter(Boolean).slice(0, 4);
    if (terms.length > 0) {
      // Only people who share their name are findable by it (privacy setting).
      and.push({
        recipient: {
          shareName: true,
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term, mode: "insensitive" as const } },
              { lastName: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
            ],
          })),
        },
      });
    }
  }

  const where: Prisma.PackageWhereInput = { communityId, AND: and };
  const total = await prisma.package.count({ where });
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / PACKAGE_PAGE_SIZE)));

  const rows = await prisma.package.findMany({
    where,
    include: {
      apartment: true,
      building: true,
      recipient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          shareName: true,
          ...(staff ? { email: true } : {}),
        },
      },
    },
    orderBy: packageOrderBy(query),
    skip: (page - 1) * PACKAGE_PAGE_SIZE,
    take: PACKAGE_PAGE_SIZE,
  });

  return { items: rows.map(maskRecipient(actor.id)), total, page, pageSize: PACKAGE_PAGE_SIZE };
}
```

- [ ] **Step 5: Adapt existing call sites.** Find them: `grep -rn "listPackagesForViewer" domain app --include=*.test.ts --include=*.tsx`. In each test, the call used to return an array; now unwrap `.items`, e.g. `const result = await listPackagesForViewer(a, id);` → `const { items: result } = await listPackagesForViewer(a, id);` and inline uses `(await listPackagesForViewer(...)).items`. If an existing test lists a picked-up package and expects to see it, pass `parsePackageQuery({ status: "all" })`. Leave `app/packages/page.tsx` for Task 3.

- [ ] **Step 6: Run all package domain tests**

Run: `npx vitest run domain/packages`
Expected: PASS, including the 8 new tests and the adapted existing ones.

- [ ] **Step 7: Commit**

```bash
git add domain/packages
git commit -m "feat: filter, sort and paginate packages in the domain query"
```

---

### Task 3: Wire the page to the new query

**Files:**
- Modify: `app/packages/page.tsx`
- Modify: `components/packages/PackagesList.tsx`

**Interfaces:**
- Consumes: `parsePackageQuery`, `PackageQuery`, `listPackagesForViewer` (Tasks 1-2).
- Produces: `PackagesList` props `{ packages: PackageWithRelations[]; total: number; page: number; pageSize: number; query: PackageQuery; buildings: Pick<Building, "id" | "name">[]; isStaff: boolean }`. Tasks 4 and 5 rely on exactly these names.

- [ ] **Step 1: Edit `app/packages/page.tsx`.** Replace the `searchParams` type and the list call, and pass the new props. The component signature becomes:

```tsx
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
```

Replace `const { q } = await searchParams; const packages = await listPackagesForViewer(user, membership.communityId, { search: q });` with:

```tsx
  const query = parsePackageQuery(await searchParams);
  const { items, total, page, pageSize } = await listPackagesForViewer(user, membership.communityId, query);
```

Add import `import { parsePackageQuery } from "@/domain/packages/query";`. Replace the `<PackagesList ... />` usage with:

```tsx
      <PackagesList
        packages={items}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        buildings={buildings}
        isStaff={isStaff}
      />
```

- [ ] **Step 1b: Fix the dashboard caller `app/page.tsx`** (also calls `listPackagesForViewer`, found during Task 2). The default query already means "not picked up, newest first", which is what the dashboard shows. Replace the destructuring so the count stays accurate beyond one page:

```tsx
  const [{ items: packages, total: waitingTotal }, reports, profile] = await Promise.all([
    listPackagesForViewer(user, membership.communityId),
```

and after `const s = summarizeDashboard({ userId: user.id, packages, reports });` change `s.waitingPackageCount` usages to `waitingTotal` (the only one is the stat tile at ~line 134 and the badge at ~line 181). Leave `summarizeDashboard` and its tests untouched.

- [ ] **Step 2: Edit `components/packages/PackagesList.tsx` props.** Replace the props block and import:

```tsx
import type { Building } from "@/lib/generated/prisma";
import type { PackageQuery } from "@/domain/packages/query";

export function PackagesList({
  packages,
  total,
  page,
  pageSize,
  query,
  buildings,
  isStaff,
}: {
  packages: PackageWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  query: PackageQuery;
  buildings: Pick<Building, "id" | "name">[];
  isStaff: boolean;
}) {
```

Leave the body as is for now; unused props are fine until Tasks 4-5 (if lint complains about unused vars, add `void` usage only temporarily, or finish Tasks 4-5 before running lint).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the browser.** Dev server runs with `NEXT_PUBLIC_E2E_IMPERSONATE=1 npm run dev:gcp`; restart it if it was stopped (after moving files Next may need `rm -rf .next`). Open `http://localhost:3001/api/dev/impersonate?as=manager`, then `/packages`: only non-picked-up packages show (previously picked-up ones such as `E2E-PKG-001` are gone); `/packages?status=all` shows them again.

- [ ] **Step 5: Commit**

```bash
git add app/packages/page.tsx components/packages/PackagesList.tsx
git commit -m "feat: packages page reads filters, sort and page from the URL"
```

---

### Task 4: Toolbar with status switch and staff filters

**Files:**
- Create: `components/packages/use-package-params.ts`
- Create: `components/packages/PackagesToolbar.tsx`
- Modify: `components/packages/PackagesList.tsx`
- Modify: `messages/pl.json`, `messages/en.json`

**Interfaces:**
- Consumes: `PackageQuery` (Task 1), `PackagesList` props (Task 3).
- Produces: `usePackageParams(): (patch: Record<string, string | undefined>) => void` (Task 5 reuses it) and `<PackagesToolbar query isStaff buildings />`.

- [ ] **Step 1: Add translations.** Run this script (creates the same keys in both files; verify afterwards that the diff has no deletions):

```bash
python3 - <<'EOF'
import json
add = {
 "pl": {
  "filters": {
   "openOnly": "Tylko nieodebrane",
   "building": "Budynek",
   "allBuildings": "Wszystkie budynki",
   "apartment": "Mieszkanie",
   "recipient": "Odbiorca (imię, nazwisko, email)",
   "search": "Szukaj",
   "reset": "Wyczyść filtry",
   "sort": "Sortuj"
  },
  "sortOptions": {
   "received:desc": "Najnowsze",
   "received:asc": "Najstarsze",
   "apartment:asc": "Lokal A → Z",
   "apartment:desc": "Lokal Z → A",
   "status:asc": "Status ↑",
   "status:desc": "Status ↓"
  },
  "pagination": {
   "summary": "Pokazano {from}–{to} z {total}",
   "previous": "Poprzednia",
   "next": "Następna",
   "page": "Strona {page} z {count}"
  },
  "noOpen": "Brak nieodebranych paczek",
  "noOpenHint": "Wyłącz „Tylko nieodebrane”, aby zobaczyć historię."
 },
 "en": {
  "filters": {
   "openOnly": "Not picked up only",
   "building": "Building",
   "allBuildings": "All buildings",
   "apartment": "Apartment",
   "recipient": "Recipient (name, email)",
   "search": "Search",
   "reset": "Clear filters",
   "sort": "Sort"
  },
  "sortOptions": {
   "received:desc": "Newest",
   "received:asc": "Oldest",
   "apartment:asc": "Apartment A → Z",
   "apartment:desc": "Apartment Z → A",
   "status:asc": "Status ↑",
   "status:desc": "Status ↓"
  },
  "pagination": {
   "summary": "Showing {from}–{to} of {total}",
   "previous": "Previous",
   "next": "Next",
   "page": "Page {page} of {count}"
  },
  "noOpen": "No packages waiting for pickup",
  "noOpenHint": "Turn off “Not picked up only” to see the history."
 }
}
for loc, keys in add.items():
    p = f"messages/{loc}.json"
    d = json.load(open(p))
    d["packages"].update(keys)
    open(p, "w").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
EOF
git diff --numstat messages/
```

Expected: the numstat shows only additions (deletions column `0`). If not, `git checkout messages/*.json` and insert the keys by hand.

- [ ] **Step 2: Create the URL hook** `components/packages/use-package-params.ts`:

```ts
"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Writes a patch into the URL. A falsy value removes the key (defaults stay out of the URL).
// Any change except `page` itself returns to page 1.
export function usePackageParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      if (!("page" in patch)) params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );
}
```

- [ ] **Step 3: Create the toolbar** `components/packages/PackagesToolbar.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PackageQuery } from "@/domain/packages/query";
import type { Building } from "@/lib/generated/prisma";
import { usePackageParams } from "./use-package-params";

const SORT_OPTIONS = ["received:desc", "received:asc", "apartment:asc", "apartment:desc", "status:asc", "status:desc"] as const;

export function PackagesToolbar({
  query,
  isStaff,
  buildings,
}: {
  query: PackageQuery;
  isStaff: boolean;
  buildings: Pick<Building, "id" | "name">[];
}) {
  const t = useTranslations("packages");
  const update = usePackageParams();
  const filtersActive = Boolean(query.q || query.building || query.apartment || query.recipient);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    update({
      q: String(data.get("q") ?? "").trim() || undefined,
      apartment: String(data.get("apartment") ?? "").trim() || undefined,
      recipient: String(data.get("recipient") ?? "").trim() || undefined,
    });
  };

  return (
    <div className="space-y-3">
      <form
        // Remount when the URL changes the text values (e.g. "clear filters").
        key={`${query.q}|${query.apartment}|${query.recipient}`}
        onSubmit={submit}
        className="flex flex-col gap-3"
      >
        {isStaff && (
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={query.q}
                placeholder={t("searchPlaceholder")}
                className="bg-muted pl-9"
              />
            </div>
            <Select
              value={query.building || "all"}
              onValueChange={(v) => update({ building: v === "all" ? undefined : v })}
            >
              <SelectTrigger aria-label={t("filters.building")} className="lg:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allBuildings")}</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              name="apartment"
              defaultValue={query.apartment}
              placeholder={t("filters.apartment")}
              aria-label={t("filters.apartment")}
              className="lg:w-36"
            />
            <Input
              name="recipient"
              defaultValue={query.recipient}
              placeholder={t("filters.recipient")}
              aria-label={t("filters.recipient")}
              className="lg:w-64"
            />
            <Button type="submit">{t("filters.search")}</Button>
          </div>
        )}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="packages-open-only"
            checked={query.status === "open"}
            onCheckedChange={(on) => update({ status: on ? undefined : "all" })}
          />
          <Label htmlFor="packages-open-only">{t("filters.openOnly")}</Label>
        </div>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update({ q: undefined, building: undefined, apartment: undefined, recipient: undefined })}
            >
              {t("filters.reset")}
            </Button>
          )}
          {/* Phones have no table header to click, so sorting is a select there. */}
          <Select
            value={`${query.sort}:${query.dir}`}
            onValueChange={(v) => {
              const [sort, dir] = v.split(":");
              update({ sort: sort === "received" ? undefined : sort, dir: dir === "desc" ? undefined : dir });
            }}
          >
            <SelectTrigger aria-label={t("filters.sort")} className="w-44 md:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {t(`sortOptions.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
```

Note: next-intl keys containing `:` — `t("sortOptions.received:desc")` works because only `.` is a separator; if the lookup fails in the browser, rename the keys to `receivedDesc` etc. in the JSON and map them in `SORT_OPTIONS`.

- [ ] **Step 4: Use it in `PackagesList.tsx`.** Delete the old search form, `useState`/`useRouter`/`useSearchParams` search code, the `Search` and `Input` imports, and the whole old toolbar `<div className="flex flex-col gap-4 md:flex-row ...">` block (the subtitle paragraph stays). Result for the top of the returned JSX:

```tsx
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {isStaff ? t("subtitleStaff") : t("subtitleResident")}
      </p>
      <PackagesToolbar query={query} isStaff={isStaff} buildings={buildings} />
```

Add `import { PackagesToolbar } from "./PackagesToolbar";`. Replace the empty-state logic with:

```tsx
      {packages.length === 0 ? (
        query.q || query.building || query.apartment || query.recipient ? (
          <EmptyState illustration="search-empty" title={t("noResults")} description={t("noResultsHint")} />
        ) : query.status === "open" ? (
          <EmptyState illustration="all-clear" title={t("noOpen")} description={t("noOpenHint")} />
        ) : (
          <EmptyState
            illustration="locker"
            title={t("empty")}
            description={isStaff ? t("emptyStaff") : t("emptyResident")}
          />
        )
      ) : (
```

(Keep the existing `<Card>` table branch unchanged.)

- [ ] **Step 5: Typecheck and verify in the browser**

Run: `npx tsc --noEmit`
Expected: no errors. In the browser (manager): the switch toggles `?status=all` and back; typing an apartment number and pressing Enter sets `?apartment=...` and narrows the list; the building select sets `?building=`; "Wyczyść filtry" clears the fields and URL; no console errors.

- [ ] **Step 6: Commit**

```bash
git add components/packages messages
git commit -m "feat: packages toolbar with status switch and staff filters"
```

---

### Task 5: Sortable headers and pagination

**Files:**
- Create: `components/packages/PackagesPagination.tsx`
- Modify: `components/packages/PackagesList.tsx`

**Interfaces:**
- Consumes: `usePackageParams` (Task 4), `PackagesList` props (Task 3), translation keys `packages.pagination.*` (Task 4).
- Produces: `<PackagesPagination page pageSize total />`.

- [ ] **Step 1: Create the pagination** `components/packages/PackagesPagination.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePackageParams } from "./use-package-params";

export function PackagesPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useTranslations("packages.pagination");
  const update = usePackageParams();
  if (total === 0) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const go = (p: number) => update({ page: p === 1 ? undefined : String(p) });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>{t("summary", { from, to, total })}</p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t("previous")}
          </Button>
          <span>{t("page", { page, count: pageCount })}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => go(page + 1)}>
            {t("next")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the sortable header and use it in `PackagesList.tsx`.** Add imports `import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";`, `import { PackagesPagination } from "./PackagesPagination";`, `import { usePackageParams } from "./use-package-params";`, and `import type { PackageSort } from "@/domain/packages/query";`. Above `PackagesList` add:

```tsx
function SortHead({
  label,
  sortKey,
  query,
  className,
}: {
  label: string;
  sortKey: PackageSort;
  query: PackageQuery;
  className?: string;
}) {
  const update = usePackageParams();
  const active = query.sort === sortKey;
  // A new column starts ascending (received starts newest-first); the active one toggles.
  const nextDir = active ? (query.dir === "asc" ? "desc" : "asc") : sortKey === "received" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : query.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase tracking-[0.08em] hover:text-foreground"
        onClick={() =>
          update({
            sort: sortKey === "received" ? undefined : sortKey,
            dir: nextDir === "desc" ? undefined : nextDir,
          })
        }
      >
        {label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </TableHead>
  );
}
```

Replace the header cells for location, received and status:

```tsx
                <TableHead>{t("col.package")}</TableHead>
                <SortHead label={t("col.location")} sortKey="apartment" query={query} />
                <SortHead label={t("col.received")} sortKey="received" query={query} className="hidden md:table-cell" />
                <SortHead label={t("col.status")} sortKey="status" query={query} />
                <TableHead className="text-right">{isStaff ? t("col.actions") : null}</TableHead>
```

Right after the closing `</Card>` of the table branch (inside the same fragment/branch) render pagination. Because the table branch is a ternary arm with a single `<Card>`, wrap it:

```tsx
      ) : (
        <>
          <Card className="gap-0 overflow-hidden py-0">
            {/* existing <Table> ... </Table> unchanged */}
          </Card>
          <PackagesPagination page={page} pageSize={pageSize} total={total} />
        </>
      )}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint components/packages app/packages domain/packages`
Expected: no errors.

- [ ] **Step 4: Verify in the browser** as manager at desktop width: header click on "Lokal i odbiorca" sorts `?sort=apartment&dir=asc`, second click flips to `dir=desc`; "Przyjęcie" click gives `dir=asc` (default sort removed from URL); `aria-sort` follows. `?status=all` plus enough data shows "Pokazano 1–N z M" and prev/next when M > 20 (if the DB has under 21, temporarily verify with `?page=2` clamping back to page 1). At a phone width (resize 375) the sort select appears and works. Resident view (`/api/dev/impersonate?as=resident1`): no filter inputs, switch + pagination work.

- [ ] **Step 5: Commit**

```bash
git add components/packages
git commit -m "feat: sortable package table headers and pagination"
```

---

### Task 6: Recipient hints in the register modal

**Files:**
- Modify: `domain/residencies/recipients.ts`
- Test: `domain/residencies/recipients.test.ts`
- Modify: `components/packages/CreatePackageForm.tsx`
- Modify: `messages/pl.json`, `messages/en.json`

**Interfaces:**
- Produces: `PackageRecipientOptions["options"]` elements `{ userId: string; name: string; kind: ResidencyKind; masked: boolean; since: string }` where `since` is the residency `createdAt` as an ISO string (Dates are avoided across the server-action boundary).

- [ ] **Step 1: Write the failing test** — append inside `describe("package recipients", ...)` in `domain/residencies/recipients.test.ts` (uses the file's existing `owner`, `tenant`, `receptionist`, `community`, `apartment`):

```ts
  it("marks hidden-name recipients as masked and gives each a since date", async () => {
    await prisma.user.update({ where: { id: owner.id }, data: { shareName: false } });

    const { options } = await getPackageRecipientOptions(receptionist, community.id, apartment.id);

    const o = options.find((x) => x.userId === owner.id)!;
    const t = options.find((x) => x.userId === tenant.id)!;
    expect(o.masked).toBe(true);
    expect(t.masked).toBe(false);
    const link = await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: owner.id } });
    expect(o.since).toBe(link.createdAt.toISOString());
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run domain/residencies/recipients.test.ts`
Expected: FAIL (`masked` undefined).

- [ ] **Step 3: Implement** in `domain/residencies/recipients.ts`: change the options element type and the mapping:

```ts
  options: { userId: string; name: string; kind: ResidencyKind; masked: boolean; since: string }[];
```

```ts
  const options = links.map((l) => ({
    userId: l.userId,
    name: nameOf(l.user),
    kind: l.kind,
    masked: !l.user.shareName && l.user.id !== actor.id,
    since: l.createdAt.toISOString(),
  }));
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run domain/residencies/recipients.test.ts`
Expected: PASS (all, existing assertions only read `userId`/`kind`/`name`).

- [ ] **Step 5: Translations.** Run:

```bash
python3 - <<'EOF'
import json
add = {
 "pl": {"recipientMaskedOwner": "{name} (właściciel od {since})", "recipientMaskedTenant": "{name} (najemca od {since})"},
 "en": {"recipientMaskedOwner": "{name} (owner since {since})", "recipientMaskedTenant": "{name} (tenant since {since})"},
}
for loc, keys in add.items():
    p = f"messages/{loc}.json"
    d = json.load(open(p))
    d["packages"].update(keys)
    open(p, "w").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
EOF
git diff --numstat messages/
```

Expected: only additions.

- [ ] **Step 6: Use them in `CreatePackageForm.tsx`.** Change the import to `import { useFormatter, useTranslations } from "next-intl";`, add `const format = useFormatter();` next to `const t = ...`, and replace the `recipientOptions?.options.map(...)` block with:

```tsx
                    {recipientOptions?.options.map((o) => {
                      const since = format.dateTime(new Date(o.since), { month: "2-digit", year: "numeric" });
                      const key = o.masked
                        ? o.kind === "OWNER" ? "recipientMaskedOwner" : "recipientMaskedTenant"
                        : o.kind === "OWNER" ? "recipientOwner" : "recipientTenant";
                      return (
                        <SelectItem key={o.userId} value={o.userId}>
                          {t(key, { name: o.name, since })}
                        </SelectItem>
                      );
                    })}
```

- [ ] **Step 7: Typecheck and verify in the browser.** `npx tsc --noEmit` clean. As manager: open "Zarejestruj paczkę", building A, apartment 4: the owner (masked) reads "Mieszkaniec Budynek A / 4 (właściciel od MM.RRRR)", unmasked entries read as before. Do not press "Zapisz": it would create a real package and send notifications on the connected DB.

- [ ] **Step 8: Commit**

```bash
git add domain/residencies components/packages/CreatePackageForm.tsx messages
git commit -m "feat: tell masked recipients apart by relationship and join date"
```

---

### Task 7: Full verification

- [ ] **Step 1:** `npx vitest run` — expected: all pass (local DB only).
- [ ] **Step 2:** `npx tsc --noEmit && npx eslint .` — expected: no new errors.
- [ ] **Step 3:** Browser pass as manager and as resident1 on desktop and 375px width: default view hides picked-up, filters/sort/pagination work and survive reload, empty states ("noResults", "noOpen"), recipient labels in the modal, no console errors.
- [ ] **Step 4:** Report results; do not push unless asked.
