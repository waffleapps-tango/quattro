import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import {
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import { canManageApartment, isCommunityManager } from "./access";

export async function updateResidencyPrefs(
  actor: SessionUser,
  residencyId: string,
  input: { receivesPackages?: boolean; livesHereOverride?: boolean | null },
) {
  const residency = await prisma.apartmentResidency.findUnique({ where: { id: residencyId } });
  if (!residency) throw new NotFoundError(`Residency ${residencyId} not found`);

  const isSelf = residency.userId === actor.id;
  if (!isSelf && !isCommunityManager(actor, residency.communityId)) {
    throw new UnauthorizedError(`User ${actor.id} may not edit residency ${residencyId}`);
  }
  if (input.livesHereOverride !== undefined && residency.kind !== "OWNER") {
    throw new ValidationError("livesHereOverride is only valid on owner links");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.apartmentResidency.update({
      where: { id: residencyId },
      data: {
        ...(input.receivesPackages !== undefined ? { receivesPackages: input.receivesPackages } : {}),
        ...(input.livesHereOverride !== undefined ? { livesHereOverride: input.livesHereOverride } : {}),
        // Someone who stops receiving packages cannot stay the default recipient.
        ...(input.receivesPackages === false ? { isPrimary: false } : {}),
      },
    });
    await writeAuditLog(tx, {
      communityId: residency.communityId,
      userId: actor.id,
      action: "RESIDENCY_PREFS_CHANGED",
      entity: "ApartmentResidency",
      entityId: residencyId,
      metadata: { ...input },
    });
    return updated;
  });
}

export async function setPrimaryContact(
  actor: SessionUser,
  apartmentId: string,
  residencyId: string | null,
) {
  const apartment = await prisma.apartment.findUnique({
    where: { id: apartmentId },
    include: { building: true },
  });
  if (!apartment) throw new NotFoundError(`Apartment ${apartmentId} not found`);
  const communityId = apartment.building.communityId;

  if (!canManageApartment(actor, communityId, apartmentId)) {
    throw new UnauthorizedError(
      `User ${actor.id} may not set the primary contact of apartment ${apartmentId}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (residencyId) {
      const target = await tx.apartmentResidency.findUnique({ where: { id: residencyId } });
      if (!target || target.apartmentId !== apartmentId) {
        throw new TenantMismatchError(`Residency ${residencyId} does not belong to apartment ${apartmentId}`);
      }
      if (!target.receivesPackages) {
        throw new ValidationError("The primary contact must receive package notifications");
      }
    }

    await tx.apartmentResidency.updateMany({
      where: { apartmentId, isPrimary: true },
      data: { isPrimary: false },
    });
    if (residencyId) {
      await tx.apartmentResidency.update({ where: { id: residencyId }, data: { isPrimary: true } });
    }

    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "PRIMARY_CONTACT_CHANGED",
      entity: "Apartment",
      entityId: apartmentId,
      metadata: { residencyId },
    });
  });
}
