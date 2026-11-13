import prisma from "@/lib/prisma";
import { requireMembership, residentApartmentIds, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import {
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import { closePendingJoinRequests } from "@/domain/join-requests";
import { Role, type Prisma, type ResidencyKind } from "@/lib/generated/prisma";
import { canManageApartment, isApartmentOwner, isCommunityManager, MANAGE_ROLES } from "./access";

export async function linkResident(
  tx: Prisma.TransactionClient,
  p: {
    actorId: string;
    communityId: string;
    email: string;
    buildingId: string;
    apartmentId: string;
    kind: ResidencyKind;
  },
) {
  const apartment = await tx.apartment.findUnique({
    where: { id: p.apartmentId },
    include: { building: true },
  });
  if (
    !apartment ||
    apartment.buildingId !== p.buildingId ||
    apartment.building.communityId !== p.communityId
  ) {
    throw new TenantMismatchError(
      `Apartment ${p.apartmentId} does not belong to building ${p.buildingId} in community ${p.communityId}`,
    );
  }

  const user =
    (await tx.user.findUnique({ where: { email: p.email } })) ??
    (await tx.user.create({
      data: { email: p.email, clerkUserId: `pending:${p.email}` },
    }));

  const membership = await tx.membership.findUnique({
    where: { userId_communityId: { userId: user.id, communityId: p.communityId } },
  });
  if (!membership) {
    await tx.membership.create({
      data: {
        userId: user.id,
        communityId: p.communityId,
        buildingId: p.buildingId,
        role: Role.RESIDENT,
      },
    });
    await closePendingJoinRequests(tx, user.id, p.communityId);
  }

  const existing = await tx.apartmentResidency.findUnique({
    where: { userId_apartmentId: { userId: user.id, apartmentId: p.apartmentId } },
  });
  if (existing) {
    throw new ValidationError(`User ${p.email} is already linked to apartment ${p.apartmentId}`);
  }

  const residency = await tx.apartmentResidency.create({
    data: {
      userId: user.id,
      apartmentId: p.apartmentId,
      communityId: p.communityId,
      kind: p.kind,
    },
  });

  await writeAuditLog(tx, {
    communityId: p.communityId,
    userId: p.actorId,
    action: "RESIDENCY_ADDED",
    entity: "ApartmentResidency",
    entityId: residency.id,
    metadata: { targetEmail: p.email, apartmentId: p.apartmentId, kind: p.kind },
  });

  return residency;
}

export async function addResidency(
  actor: SessionUser,
  input: {
    communityId: string;
    email: string;
    buildingId: string;
    apartmentId: string;
    kind: ResidencyKind;
  },
) {
  requireMembership(actor, input.communityId, MANAGE_ROLES);
  return prisma.$transaction((tx) => linkResident(tx, { actorId: actor.id, ...input }));
}

export async function addTenant(
  actor: SessionUser,
  input: { apartmentId: string; email: string },
) {
  const apartment = await prisma.apartment.findUnique({
    where: { id: input.apartmentId },
    include: { building: true },
  });
  if (!apartment) throw new NotFoundError(`Apartment ${input.apartmentId} not found`);
  const communityId = apartment.building.communityId;

  if (!canManageApartment(actor, communityId, apartment.id)) {
    throw new UnauthorizedError(
      `User ${actor.id} may not add tenants to apartment ${apartment.id}`,
    );
  }

  return prisma.$transaction((tx) =>
    linkResident(tx, {
      actorId: actor.id,
      communityId,
      email: input.email,
      buildingId: apartment.buildingId,
      apartmentId: apartment.id,
      kind: "TENANT",
    }),
  );
}

export async function removeResidency(actor: SessionUser, residencyId: string) {
  const residency = await prisma.apartmentResidency.findUnique({ where: { id: residencyId } });
  if (!residency) throw new NotFoundError(`Residency ${residencyId} not found`);

  // Admins and managers remove any link; an owner may only remove tenants of their own apartment.
  const allowed =
    isCommunityManager(actor, residency.communityId) ||
    (residency.kind === "TENANT" && isApartmentOwner(actor, residency.apartmentId));
  if (!allowed) {
    throw new UnauthorizedError(`User ${actor.id} may not remove residency ${residencyId}`);
  }

  const byManager = isCommunityManager(actor, residency.communityId);

  await prisma.$transaction(async (tx) => {
    await tx.apartmentResidency.delete({ where: { id: residencyId } });

    // An owner removing a tenant also drops the RESIDENT membership they created, once unused.
    let removedMembership = false;
    if (!byManager) {
      const remaining = await tx.apartmentResidency.count({
        where: { userId: residency.userId, communityId: residency.communityId },
      });
      if (remaining === 0) {
        const { count } = await tx.membership.deleteMany({
          where: { userId: residency.userId, communityId: residency.communityId, role: Role.RESIDENT },
        });
        removedMembership = count > 0;
      }
    }
    await writeAuditLog(tx, {
      communityId: residency.communityId,
      userId: actor.id,
      action: "RESIDENCY_REMOVED",
      entity: "ApartmentResidency",
      entityId: residencyId,
      metadata: {
        apartmentId: residency.apartmentId,
        userId: residency.userId,
        kind: residency.kind,
        ...(removedMembership ? { removedMembership } : {}),
      },
    });
  });
}

export async function listResidentApartments(actor: SessionUser, communityId: string) {
  const apartmentIds = residentApartmentIds(actor, communityId);
  if (apartmentIds.length === 0) return [];

  return prisma.apartment.findMany({
    where: { id: { in: apartmentIds } },
    include: { building: true },
    orderBy: [{ building: { name: "asc" } }, { number: "asc" }],
  });
}
