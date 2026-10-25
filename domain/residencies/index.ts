import prisma from "@/lib/prisma";
import { requireMembership, residentApartmentIds, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, TenantMismatchError, ValidationError } from "@/domain/errors";
import { Role, type ResidencyKind } from "@/lib/generated/prisma";

const MANAGE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

export async function addResidency(
  actor: SessionUser,
  input: { communityId: string; email: string; buildingId: string; apartmentId: string; kind: ResidencyKind },
) {
  requireMembership(actor, input.communityId, MANAGE_ROLES);

  return prisma.$transaction(async (tx) => {
    const apartment = await tx.apartment.findUnique({
      where: { id: input.apartmentId },
      include: { building: true },
    });
    if (
      !apartment ||
      apartment.buildingId !== input.buildingId ||
      apartment.building.communityId !== input.communityId
    ) {
      throw new TenantMismatchError(
        `Apartment ${input.apartmentId} does not belong to building ${input.buildingId} in community ${input.communityId}`,
      );
    }

    const user =
      (await tx.user.findUnique({ where: { email: input.email } })) ??
      (await tx.user.create({
        data: { email: input.email, clerkUserId: `pending:${input.email}` },
      }));

    const membership = await tx.membership.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: input.communityId } },
    });
    if (!membership) {
      await tx.membership.create({
        data: {
          userId: user.id,
          communityId: input.communityId,
          buildingId: input.buildingId,
          role: Role.RESIDENT,
        },
      });
    }

    const existing = await tx.apartmentResidency.findUnique({
      where: { userId_apartmentId: { userId: user.id, apartmentId: input.apartmentId } },
    });
    if (existing) {
      throw new ValidationError(`User ${input.email} is already linked to apartment ${input.apartmentId}`);
    }

    const residency = await tx.apartmentResidency.create({
      data: {
        userId: user.id,
        apartmentId: input.apartmentId,
        communityId: input.communityId,
        kind: input.kind,
      },
    });

    await writeAuditLog(tx, {
      communityId: input.communityId,
      userId: actor.id,
      action: "RESIDENCY_ADDED",
      entity: "ApartmentResidency",
      entityId: residency.id,
      metadata: { targetEmail: input.email, apartmentId: input.apartmentId, kind: input.kind },
    });

    return residency;
  });
}

export async function removeResidency(actor: SessionUser, residencyId: string) {
  const residency = await prisma.apartmentResidency.findUnique({ where: { id: residencyId } });
  if (!residency) throw new NotFoundError(`Residency ${residencyId} not found`);

  requireMembership(actor, residency.communityId, MANAGE_ROLES);

  await prisma.$transaction(async (tx) => {
    await tx.apartmentResidency.delete({ where: { id: residencyId } });
    await writeAuditLog(tx, {
      communityId: residency.communityId,
      userId: actor.id,
      action: "RESIDENCY_REMOVED",
      entity: "ApartmentResidency",
      entityId: residencyId,
      metadata: { apartmentId: residency.apartmentId, userId: residency.userId },
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
