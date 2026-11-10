# Community Info Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/info` page where every community member reads sections of rarely-changing info (phone lists, trash schedule/rules), and ADMIN/MANAGER/RECEPTIONIST add, edit, delete and reorder sections inline.

**Architecture:** Two Prisma models (`InfoSection`, `InfoContact`), a `domain/info` module (tenant-checked mutations + audit log, same style as `domain/packages`), server actions in `actions/info.ts`, and a server-rendered page with client dialogs for editing.

**Tech Stack:** Next.js 15 App Router, Prisma/Postgres, next-intl (`messages/en.json`, `messages/pl.json`), zod, Radix dialogs (`components/ui`), sonner toasts, vitest (runs against the real DB from `docker-compose.yml`).

## Global Constraints

- Edit roles are `STAFF_ROLES` from `domain/packages/roles.ts` (`RECEPTIONIST, MANAGER, ADMIN`). RESIDENT is read-only. No per-section permissions.
- Section kinds: `CONTACTS` (name + phone rows) or `TEXT` (free text, line breaks preserved, no markdown).
- Limits: title 1-100 chars, body max 5000, max 30 contacts per section, contact name 1-100, phone 1-30 (trimmed, no format check), note max 200.
- Section content is not translated. Only UI labels go in `messages/en.json` and `messages/pl.json` (both files must get every new key).
- Authorization is done in `domain/`, not in actions or pages. A staff member of another community gets `UnauthorizedError` (via `requireMembership` on the section's own community).
- Follow existing patterns: `useActionState` forms returning `{ message, success }`, `getTranslations` in actions, `revalidatePath`.

---

## File Structure

- Modify `prisma/schema.prisma`: enum `InfoSectionKind`, models `InfoSection`, `InfoContact`, relation on `Community`.
- Create `domain/info/index.ts`: `listSections`, `createSection`, `updateSection`, `deleteSection`, `moveSection`.
- Create `domain/info/index.test.ts`.
- Modify `domain/audit/log.ts`: three new audit actions.
- Modify `domain/__test-helpers__/fixtures.ts`: clean up the new tables.
- Create `actions/info.ts`.
- Create `components/info/InfoSectionCard.tsx` (server), `SectionDialog.tsx`, `SectionActions.tsx` (client).
- Create `app/info/page.tsx`, `app/info/loading.tsx`.
- Modify `components/NavList.tsx`, `messages/en.json`, `messages/pl.json`, `prisma/seed.ts`.

---

### Task 1: Schema, migration, domain layer

**Files:**
- Modify: `prisma/schema.prisma`, `domain/audit/log.ts`, `domain/__test-helpers__/fixtures.ts`
- Create: `domain/info/index.ts`, `domain/info/index.test.ts`

**Interfaces:**
- Produces (used by Tasks 2-3):
  - `type ContactInput = { name: string; phone: string; note?: string }`
  - `type SectionInput = { kind: InfoSectionKind; title: string; body?: string; contacts?: ContactInput[] }`
  - `type SectionWithContacts = InfoSection & { contacts: InfoContact[] }`
  - `listSections(user: SessionUser, communityId: string): Promise<SectionWithContacts[]>`
  - `createSection(actor: SessionUser, communityId: string, input: SectionInput): Promise<SectionWithContacts>`
  - `updateSection(actor: SessionUser, sectionId: string, input: SectionInput): Promise<SectionWithContacts>`
  - `deleteSection(actor: SessionUser, sectionId: string): Promise<void>`
  - `moveSection(actor: SessionUser, sectionId: string, direction: "up" | "down"): Promise<void>`
  - `INFO_EDIT_ROLES: Role[]`

- [ ] **Step 1: Add schema**

In `prisma/schema.prisma` add `infoSections InfoSection[]` to the `Community` model's relation list, and append:

```prisma
enum InfoSectionKind {
  CONTACTS
  TEXT
}

model InfoSection {
  id          String          @id @default(cuid())
  communityId String
  title       String
  kind        InfoSectionKind
  body        String          @default("")
  position    Int
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  community Community     @relation(fields: [communityId], references: [id])
  contacts  InfoContact[]

  @@index([communityId, position])
}

model InfoContact {
  id        String  @id @default(cuid())
  sectionId String
  name      String
  phone     String
  note      String?
  position  Int

  section InfoSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@index([sectionId, position])
}
```

- [ ] **Step 2: Migrate**

Run: `docker compose up -d && npx prisma migrate dev --name add_community_info`
Expected: migration created and applied, client regenerated into `lib/generated/prisma`.

- [ ] **Step 3: Audit actions and test cleanup**

In `domain/audit/log.ts` extend the `AuditAction` union with:

```ts
  | "INFO_SECTION_CREATED"
  | "INFO_SECTION_UPDATED"
  | "INFO_SECTION_DELETED"
```

In `domain/__test-helpers__/fixtures.ts` `cleanupDatabase`, add as the first two lines (before `apartmentResidency.deleteMany()`):

```ts
  await prisma.infoContact.deleteMany();
  await prisma.infoSection.deleteMany();
```

- [ ] **Step 4: Write the failing tests**

Create `domain/info/index.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";
import {
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
  cleanupDatabase,
} from "@/domain/__test-helpers__/fixtures";
import {
  createSection,
  deleteSection,
  listSections,
  moveSection,
  updateSection,
} from "@/domain/info";

afterEach(async () => {
  await cleanupDatabase();
});

async function setup() {
  const { community } = await createCommunityWithBuildingAndApartment();
  const other = await createCommunityWithBuildingAndApartment();
  const admin = await createUserWithMembership({ communityId: community.id, role: Role.ADMIN });
  const resident = await createUserWithMembership({ communityId: community.id, role: Role.RESIDENT });
  const outsider = await createUserWithMembership({ communityId: other.community.id, role: Role.ADMIN });
  return { community, admin, resident, outsider };
}

const phones = {
  kind: "CONTACTS" as const,
  title: "Telefony alarmowe",
  contacts: [
    { name: "Policja", phone: "997" },
    { name: "Serwis wind", phone: "600 100 200", note: "24h" },
  ],
};

describe("info sections", () => {
  it("staff creates a contacts section with ordered contacts and an audit entry", async () => {
    const { community, admin } = await setup();
    const section = await createSection(admin, community.id, phones);
    expect(section.contacts.map((c) => c.name)).toEqual(["Policja", "Serwis wind"]);
    const audit = await prisma.auditLog.findMany({
      where: { entity: "InfoSection", entityId: section.id, action: "INFO_SECTION_CREATED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("resident can read but not write", async () => {
    const { community, admin, resident } = await setup();
    const section = await createSection(admin, community.id, phones);
    expect(await listSections(resident, community.id)).toHaveLength(1);
    await expect(createSection(resident, community.id, phones)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(updateSection(resident, section.id, phones)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(deleteSection(resident, section.id)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(moveSection(resident, section.id, "up")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("staff of another community cannot read or write", async () => {
    const { community, admin, outsider } = await setup();
    const section = await createSection(admin, community.id, phones);
    await expect(listSections(outsider, community.id)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(createSection(outsider, community.id, phones)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(updateSection(outsider, section.id, phones)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(deleteSection(outsider, section.id)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("update replaces contacts and can switch to a text section", async () => {
    const { community, admin } = await setup();
    const section = await createSection(admin, community.id, phones);
    const updated = await updateSection(admin, section.id, {
      kind: "CONTACTS",
      title: "Telefony",
      contacts: [{ name: "Straż", phone: "998" }],
    });
    expect(updated.contacts.map((c) => c.name)).toEqual(["Straż"]);
    const text = await updateSection(admin, section.id, { kind: "TEXT", title: "Śmieci", body: "Wtorek" });
    expect(text.contacts).toHaveLength(0);
    expect(text.body).toBe("Wtorek");
    expect(await prisma.infoContact.count()).toBe(0);
  });

  it("move swaps neighbours and is a no-op at the ends", async () => {
    const { community, admin } = await setup();
    const a = await createSection(admin, community.id, { kind: "TEXT", title: "A", body: "" });
    const b = await createSection(admin, community.id, { kind: "TEXT", title: "B", body: "" });
    await moveSection(admin, a.id, "up");
    expect((await listSections(admin, community.id)).map((s) => s.title)).toEqual(["A", "B"]);
    await moveSection(admin, b.id, "up");
    expect((await listSections(admin, community.id)).map((s) => s.title)).toEqual(["B", "A"]);
    await moveSection(admin, b.id, "up");
    expect((await listSections(admin, community.id)).map((s) => s.title)).toEqual(["B", "A"]);
  });

  it("delete removes the section and its contacts", async () => {
    const { community, admin } = await setup();
    const section = await createSection(admin, community.id, phones);
    await deleteSection(admin, section.id);
    expect(await listSections(admin, community.id)).toHaveLength(0);
    expect(await prisma.infoContact.count()).toBe(0);
  });
});
```

- [ ] **Step 5: Run tests, verify they fail**

Run: `npx vitest run domain/info`
Expected: FAIL, cannot resolve `@/domain/info`.

- [ ] **Step 6: Implement the domain**

Create `domain/info/index.ts`:

```ts
import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError } from "@/domain/errors";
import { STAFF_ROLES } from "@/domain/packages/roles";
import {
  Role,
  type InfoContact,
  type InfoSection,
  type InfoSectionKind,
  type Prisma,
} from "@/lib/generated/prisma";

export const INFO_EDIT_ROLES: Role[] = STAFF_ROLES;

export type ContactInput = { name: string; phone: string; note?: string };
export type SectionInput = {
  kind: InfoSectionKind;
  title: string;
  body?: string;
  contacts?: ContactInput[];
};
export type SectionWithContacts = InfoSection & { contacts: InfoContact[] };

const withContacts = { contacts: { orderBy: { position: "asc" } } } satisfies Prisma.InfoSectionInclude;

function sectionData(input: SectionInput) {
  const isContacts = input.kind === "CONTACTS";
  return {
    title: input.title,
    kind: input.kind,
    body: isContacts ? "" : (input.body ?? ""),
    contacts: {
      create: isContacts
        ? (input.contacts ?? []).map((c, position) => ({
            name: c.name,
            phone: c.phone,
            note: c.note || null,
            position,
          }))
        : [],
    },
  };
}

async function loadForEdit(actor: SessionUser, tx: Prisma.TransactionClient, sectionId: string) {
  const section = await tx.infoSection.findUnique({ where: { id: sectionId } });
  if (!section) throw new NotFoundError(`Info section ${sectionId} not found`);
  requireMembership(actor, section.communityId, INFO_EDIT_ROLES);
  return section;
}

export async function listSections(
  user: SessionUser,
  communityId: string,
): Promise<SectionWithContacts[]> {
  requireMembership(user, communityId, Object.values(Role));
  return prisma.infoSection.findMany({
    where: { communityId },
    orderBy: { position: "asc" },
    include: withContacts,
  });
}

export async function createSection(
  actor: SessionUser,
  communityId: string,
  input: SectionInput,
): Promise<SectionWithContacts> {
  requireMembership(actor, communityId, INFO_EDIT_ROLES);
  return prisma.$transaction(async (tx) => {
    const last = await tx.infoSection.aggregate({ where: { communityId }, _max: { position: true } });
    const section = await tx.infoSection.create({
      data: { communityId, position: (last._max.position ?? -1) + 1, ...sectionData(input) },
      include: withContacts,
    });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "INFO_SECTION_CREATED",
      entity: "InfoSection",
      entityId: section.id,
      metadata: { title: section.title },
    });
    return section;
  });
}

export async function updateSection(
  actor: SessionUser,
  sectionId: string,
  input: SectionInput,
): Promise<SectionWithContacts> {
  return prisma.$transaction(async (tx) => {
    const existing = await loadForEdit(actor, tx, sectionId);
    await tx.infoContact.deleteMany({ where: { sectionId } });
    const section = await tx.infoSection.update({
      where: { id: sectionId },
      data: sectionData(input),
      include: withContacts,
    });
    await writeAuditLog(tx, {
      communityId: existing.communityId,
      userId: actor.id,
      action: "INFO_SECTION_UPDATED",
      entity: "InfoSection",
      entityId: sectionId,
      metadata: { title: section.title },
    });
    return section;
  });
}

export async function deleteSection(actor: SessionUser, sectionId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await loadForEdit(actor, tx, sectionId);
    await tx.infoSection.delete({ where: { id: sectionId } });
    await writeAuditLog(tx, {
      communityId: existing.communityId,
      userId: actor.id,
      action: "INFO_SECTION_DELETED",
      entity: "InfoSection",
      entityId: sectionId,
      metadata: { title: existing.title },
    });
  });
}

export async function moveSection(
  actor: SessionUser,
  sectionId: string,
  direction: "up" | "down",
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const section = await loadForEdit(actor, tx, sectionId);
    const neighbour = await tx.infoSection.findFirst({
      where: {
        communityId: section.communityId,
        position: direction === "up" ? { lt: section.position } : { gt: section.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return;
    await tx.infoSection.update({ where: { id: section.id }, data: { position: neighbour.position } });
    await tx.infoSection.update({ where: { id: neighbour.id }, data: { position: section.position } });
  });
}
```

- [ ] **Step 7: Run tests, verify they pass**

Run: `npx vitest run domain/info`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add prisma domain
git commit -m "feat: community info sections domain (schema, tenant-checked mutations, tests)"
```

---

### Task 2: Server actions

**Files:**
- Create: `actions/info.ts`
- Modify: `messages/en.json`, `messages/pl.json` (the `errors`-style `info.actions` keys, added in Task 3 Step 1 together with all other `info` keys — do Task 3 Step 1 first if running tasks out of order)

**Interfaces:**
- Consumes: Task 1 domain functions.
- Produces (used by Task 3):
  - `saveInfoSectionAction(prev: ActionState, formData: FormData): Promise<ActionState>` — FormData fields: `communityId`, `id` (optional; present = update), `title`, `kind`, `body`, `contacts` (JSON array of `{name, phone, note}`).
  - `deleteInfoSectionAction(sectionId: string): Promise<ActionState>`
  - `moveInfoSectionAction(sectionId: string, direction: "up" | "down"): Promise<ActionState>`
  - `type ActionState = { message: string; success: boolean }`

- [ ] **Step 1: Write the actions**

Create `actions/info.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { createSection, deleteSection, moveSection, updateSection } from "@/domain/info";
import { NotFoundError, UnauthorizedError } from "@/domain/errors";
import { InfoSectionKind } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean };

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(30),
  note: z.string().trim().max(200).optional(),
});

const sectionSchema = z.object({
  communityId: z.string().min(1),
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(100),
  kind: z.nativeEnum(InfoSectionKind),
  body: z.string().trim().max(5000),
  contacts: z.array(contactSchema).max(30),
});

function parseContacts(raw: FormDataEntryValue | null): unknown {
  try {
    const rows = JSON.parse(typeof raw === "string" ? raw : "[]");
    if (!Array.isArray(rows)) return [];
    // Drop rows the user left completely blank.
    return rows.filter((r) => r && (String(r.name ?? "").trim() || String(r.phone ?? "").trim()));
  } catch {
    return null;
  }
}

async function run(work: (t: Awaited<ReturnType<typeof getTranslations>>) => Promise<string>) {
  const t = await getTranslations("info.actions");
  try {
    return { message: await work(t), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    console.error(error);
    return { message: t("failed"), success: false };
  }
}

export async function saveInfoSectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const validated = sectionSchema.safeParse({
    communityId: formData.get("communityId"),
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    kind: formData.get("kind"),
    body: formData.get("body") ?? "",
    contacts: parseContacts(formData.get("contacts")),
  });
  if (!validated.success) return { message: te("fillRequired"), success: false };

  const { id, communityId, ...input } = validated.data;
  const result = await run(async (t) => {
    if (id) await updateSection(actor, id, input);
    else await createSection(actor, communityId, input);
    return t("saved");
  });
  if (result.success) revalidatePath("/info");
  return result;
}

export async function deleteInfoSectionAction(sectionId: string): Promise<ActionState> {
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };
  const result = await run(async (t) => {
    await deleteSection(actor, sectionId);
    return t("deleted");
  });
  if (result.success) revalidatePath("/info");
  return result;
}

export async function moveInfoSectionAction(
  sectionId: string,
  direction: "up" | "down",
): Promise<ActionState> {
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };
  if (direction !== "up" && direction !== "down") return { message: te("invalidForm"), success: false };
  const result = await run(async (t) => {
    await moveSection(actor, sectionId, direction);
    return t("moved");
  });
  if (result.success) revalidatePath("/info");
  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `actions/info.ts`.

- [ ] **Step 3: Commit**

```bash
git add actions/info.ts
git commit -m "feat: info section server actions"
```

---

### Task 3: Page, components, nav, translations, seed

**Files:**
- Create: `app/info/page.tsx`, `app/info/loading.tsx`, `components/info/InfoSectionCard.tsx`, `components/info/SectionDialog.tsx`, `components/info/SectionActions.tsx`
- Modify: `components/NavList.tsx`, `messages/en.json`, `messages/pl.json`, `prisma/seed.ts`

**Interfaces:**
- Consumes: Task 1 `listSections`, `INFO_EDIT_ROLES`, `SectionWithContacts`; Task 2 actions.

- [ ] **Step 1: Translations**

In BOTH `messages/en.json` and `messages/pl.json`: add `"info": "Info"` to the `meta` block, add `"info": "Info"` to the `nav` block, and add a new top-level `info` block (place it after the `locations` block). English:

```json
"info": {
  "title": "Community info",
  "subtitle": "Phone numbers, trash schedule and house rules.",
  "empty": "Nothing here yet",
  "emptyHint": "Staff can add sections with useful information.",
  "emptyResident": "Nothing has been added yet.",
  "add": "Add section",
  "edit": "Edit",
  "delete": "Delete",
  "moveUp": "Move up",
  "moveDown": "Move down",
  "dialogAddTitle": "Add section",
  "dialogEditTitle": "Edit section",
  "titleLabel": "Title",
  "kindLabel": "Type",
  "kindContacts": "Phone list",
  "kindText": "Text",
  "bodyLabel": "Text",
  "contactName": "Name",
  "contactPhone": "Phone",
  "contactNote": "Note (optional)",
  "addContact": "Add phone",
  "removeContact": "Remove phone",
  "save": "Save",
  "saving": "Saving…",
  "cancel": "Cancel",
  "deleteTitle": "Delete this section?",
  "deleteDescription": "The section and everything in it will be removed for all residents.",
  "actions": {
    "saved": "Saved",
    "deleted": "Section deleted",
    "moved": "Order changed",
    "noPermission": "You are not allowed to change this",
    "notFound": "This section no longer exists",
    "failed": "Something went wrong"
  }
}
```

Polish (`pl.json`), `meta.info`/`nav.info`: `"Informacje"`, block:

```json
"info": {
  "title": "Informacje o osiedlu",
  "subtitle": "Telefony, harmonogram wywozu śmieci i zasady.",
  "empty": "Na razie pusto",
  "emptyHint": "Pracownicy mogą dodawać sekcje z przydatnymi informacjami.",
  "emptyResident": "Nic jeszcze nie dodano.",
  "add": "Dodaj sekcję",
  "edit": "Edytuj",
  "delete": "Usuń",
  "moveUp": "Przesuń w górę",
  "moveDown": "Przesuń w dół",
  "dialogAddTitle": "Dodaj sekcję",
  "dialogEditTitle": "Edytuj sekcję",
  "titleLabel": "Tytuł",
  "kindLabel": "Typ",
  "kindContacts": "Lista telefonów",
  "kindText": "Tekst",
  "bodyLabel": "Tekst",
  "contactName": "Nazwa",
  "contactPhone": "Telefon",
  "contactNote": "Uwagi (opcjonalnie)",
  "addContact": "Dodaj telefon",
  "removeContact": "Usuń telefon",
  "save": "Zapisz",
  "saving": "Zapisywanie…",
  "cancel": "Anuluj",
  "deleteTitle": "Usunąć tę sekcję?",
  "deleteDescription": "Sekcja i cała jej zawartość zostaną usunięte dla wszystkich mieszkańców.",
  "actions": {
    "saved": "Zapisano",
    "deleted": "Sekcja usunięta",
    "moved": "Zmieniono kolejność",
    "noPermission": "Nie masz uprawnień do tej zmiany",
    "notFound": "Ta sekcja już nie istnieje",
    "failed": "Coś poszło nie tak"
  }
}
```

- [ ] **Step 2: Nav item**

In `components/NavList.tsx`: add `Info` to the lucide import, add `"info"` to the `titleKey` union, and add `{ titleKey: "info", href: "/info", icon: Info },` to `modules` after the `locations` entry.

- [ ] **Step 3: Page and loading**

Create `app/info/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EmptyState } from "@/components/system/EmptyState";
import { getCurrentUser } from "@/auth/session";
import { INFO_EDIT_ROLES, listSections } from "@/domain/info";
import { InfoSectionCard } from "@/components/info/InfoSectionCard";
import { SectionDialog } from "@/components/info/SectionDialog";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("info") };
}

export default async function InfoPage() {
  const t = await getTranslations("info");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: first membership's community, same as the other pages.
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const sections = await listSections(user, membership.communityId);
  const canEdit = INFO_EDIT_ROLES.includes(membership.role);

  return (
    <div className="container mx-auto pb-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canEdit && <SectionDialog communityId={membership.communityId} />}
      </div>
      {sections.length === 0 ? (
        <EmptyState
          icon={Info}
          title={t("empty")}
          description={canEdit ? t("emptyHint") : t("emptyResident")}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section, i) => (
            <InfoSectionCard
              key={section.id}
              section={section}
              communityId={membership.communityId}
              canEdit={canEdit}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `app/info/loading.tsx` as a copy of `app/packages/loading.tsx` (same skeleton grid; it is generic).

- [ ] **Step 4: Card (server component)**

Create `components/info/InfoSectionCard.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionActions } from "@/components/info/SectionActions";
import type { SectionWithContacts } from "@/domain/info";

export function InfoSectionCard({
  section,
  communityId,
  canEdit,
  isFirst,
  isLast,
}: {
  section: SectionWithContacts;
  communityId: string;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-lg">{section.title}</CardTitle>
        {canEdit && (
          <SectionActions section={section} communityId={communityId} isFirst={isFirst} isLast={isLast} />
        )}
      </CardHeader>
      <CardContent>
        {section.kind === "TEXT" ? (
          <p className="whitespace-pre-line text-sm">{section.body}</p>
        ) : (
          <ul className="divide-y">
            {section.contacts.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span>
                  {c.name}
                  {c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}
                </span>
                <a
                  href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                  className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
                >
                  {c.phone}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Add/edit dialog (client)**

Create `components/info/SectionDialog.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveInfoSectionAction } from "@/actions/info";
import type { SectionWithContacts } from "@/domain/info";

type ActionState = { message: string; success: boolean };
type Row = { name: string; phone: string; note: string };
const emptyRow: Row = { name: "", phone: "", note: "" };

export function SectionDialog({
  communityId,
  section,
}: {
  communityId: string;
  section?: SectionWithContacts;
}) {
  const t = useTranslations("info");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"CONTACTS" | "TEXT">(section?.kind ?? "CONTACTS");
  const [rows, setRows] = useState<Row[]>(
    section?.contacts.map((c) => ({ name: c.name, phone: c.phone, note: c.note ?? "" })) ?? [emptyRow],
  );
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveInfoSectionAction,
    { message: "", success: false },
  );

  useEffect(() => {
    if (!state.message || pending) return;
    if (state.success) {
      toast.success(state.message);
      setOpen(false);
      if (!section) setRows([emptyRow]);
    } else {
      toast.error(state.message);
    }
  }, [state, pending, section]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {section ? (
          <Button variant="ghost" size="icon" aria-label={t("edit")}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{section ? t("dialogEditTitle") : t("dialogAddTitle")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="communityId" value={communityId} />
          {section && <input type="hidden" name="id" value={section.id} />}
          <input type="hidden" name="contacts" value={JSON.stringify(rows)} />

          <div className="space-y-2">
            <Label htmlFor="info-title">{t("titleLabel")}</Label>
            <Input id="info-title" name="title" defaultValue={section?.title} maxLength={100} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="info-kind">{t("kindLabel")}</Label>
            <select
              id="info-kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "CONTACTS" | "TEXT")}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="CONTACTS">{t("kindContacts")}</option>
              <option value="TEXT">{t("kindText")}</option>
            </select>
          </div>

          {kind === "TEXT" ? (
            <div className="space-y-2">
              <Label htmlFor="info-body">{t("bodyLabel")}</Label>
              <Textarea id="info-body" name="body" defaultValue={section?.body} rows={8} maxLength={5000} />
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2">
                  <div className="space-y-2">
                    <Input
                      aria-label={t("contactName")}
                      placeholder={t("contactName")}
                      value={row.name}
                      maxLength={100}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                    />
                    <Input
                      aria-label={t("contactPhone")}
                      placeholder={t("contactPhone")}
                      value={row.phone}
                      maxLength={30}
                      inputMode="tel"
                      onChange={(e) => setRow(i, { phone: e.target.value })}
                    />
                    <Input
                      aria-label={t("contactNote")}
                      placeholder={t("contactNote")}
                      value={row.note}
                      maxLength={200}
                      onChange={(e) => setRow(i, { note: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeContact")}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length >= 30}
                onClick={() => setRows((rs) => [...rs, emptyRow])}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("addContact")}
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Note: both inputs `body` and `contacts` are submitted only for the active kind except `contacts`, which is always sent; the domain ignores `contacts` for TEXT and `body` for CONTACTS.

- [ ] **Step 6: Card actions (edit, move, delete)**

Create `components/info/SectionActions.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SectionDialog } from "@/components/info/SectionDialog";
import { deleteInfoSectionAction, moveInfoSectionAction } from "@/actions/info";
import type { SectionWithContacts } from "@/domain/info";

export function SectionActions({
  section,
  communityId,
  isFirst,
  isLast,
}: {
  section: SectionWithContacts;
  communityId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("info");
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ message: string; success: boolean }>) =>
    startTransition(async () => {
      const result = await work();
      if (!result.success) toast.error(result.message);
    });

  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("moveUp")}
        disabled={pending || isFirst}
        onClick={() => run(() => moveInfoSectionAction(section.id, "up"))}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("moveDown")}
        disabled={pending || isLast}
        onClick={() => run(() => moveInfoSectionAction(section.id, "down"))}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <SectionDialog communityId={communityId} section={section} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("delete")} className="text-destructive">
            <Trash className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run(() => deleteInfoSectionAction(section.id))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 7: Seed examples**

In `prisma/seed.ts`, immediately before `await prisma.report.createMany({`, insert:

```ts
  await prisma.infoSection.create({
    data: {
      communityId: community.id,
      title: "Telefony alarmowe",
      kind: "CONTACTS",
      position: 0,
      contacts: {
        create: [
          { name: "Numer alarmowy", phone: "112", position: 0 },
          { name: "Serwis wind", phone: "600 100 200", note: "całodobowo", position: 1 },
        ],
      },
    },
  });
  await prisma.infoSection.create({
    data: {
      communityId: community.id,
      title: "Telefony interwencyjne",
      kind: "CONTACTS",
      position: 1,
      contacts: {
        create: [
          { name: "Policja", phone: "997", position: 0 },
          { name: "Administracja", phone: "22 000 00 00", position: 1 },
        ],
      },
    },
  });
  await prisma.infoSection.create({
    data: {
      communityId: community.id,
      title: "Wywóz śmieci",
      kind: "TEXT",
      body: "Zmieszane: wtorek i piątek\nPlastik i metal: środa\nPapier: pierwszy czwartek miesiąca",
      position: 2,
    },
  });
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: all pass.

Then `npm run dev` and, signed in as a staff user and as a resident (use `preview_start` / browser): `/info` shows the sections. Staff see Add/Edit/Delete/Move controls and a resident sees none. Add a CONTACTS section, edit it, switch it to TEXT, reorder, delete. Check phone links are `tel:` and the page is usable at mobile width (375px). Check `pl` and `en` both render labels.

- [ ] **Step 9: Commit**

```bash
git add app/info components/info components/NavList.tsx messages prisma/seed.ts
git commit -m "feat: community info page with inline staff editing"
```
