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
