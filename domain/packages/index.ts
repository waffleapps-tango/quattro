import prisma from "@/lib/prisma";
import { requireMembership, residentApartmentIds, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, TenantMismatchError, UnauthorizedError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { resolvePackageRecipients } from "@/domain/packages/reminders";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { PackageStatus, type Prisma } from "@/lib/generated/prisma";

export async function createPackage(
  actor: SessionUser,
  input: {
    communityId: string;
    buildingId: string;
    apartmentId: string;
    recipientUserId?: string;
    allResidents?: boolean;
    trackingNumber?: string;
    courier?: string;
    notes?: string;
  },
) {
  requireMembership(actor, input.communityId, STAFF_ROLES);

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

    let recipientUserId: string | null = null;
    if (input.recipientUserId) {
      const link = await tx.apartmentResidency.findUnique({
        where: {
          userId_apartmentId: { userId: input.recipientUserId, apartmentId: input.apartmentId },
        },
      });
      if (!link || !link.receivesPackages) {
        throw new TenantMismatchError(
          `User ${input.recipientUserId} cannot receive packages for apartment ${input.apartmentId}`,
        );
      }
      recipientUserId = link.userId;
    } else if (!input.allResidents) {
      const primary = await tx.apartmentResidency.findFirst({
        where: { apartmentId: input.apartmentId, isPrimary: true, receivesPackages: true },
      });
      recipientUserId = primary?.userId ?? null;
    }

    const pkg = await tx.package.create({
      data: {
        communityId: input.communityId,
        buildingId: input.buildingId,
        apartmentId: input.apartmentId,
        recipientUserId,
        trackingNumber: input.trackingNumber,
        courier: input.courier,
        notes: input.notes,
        status: PackageStatus.RECEIVED,
        receivedById: actor.id,
      },
    });

    await writeAuditLog(tx, {
      communityId: input.communityId,
      userId: actor.id,
      action: "PACKAGE_CREATED",
      entity: "Package",
      entityId: pkg.id,
      metadata: { trackingNumber: input.trackingNumber ?? null },
    });

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

    return pkg;
  });
}

export async function markPickedUp(actor: SessionUser, packageId: string) {
  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg) throw new NotFoundError(`Package ${packageId} not found`);

  requireMembership(actor, pkg.communityId, STAFF_ROLES);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.package.update({
      where: { id: packageId },
      data: {
        status: PackageStatus.PICKED_UP,
        pickedUpAt: new Date(),
        pickedUpById: actor.id,
      },
    });

    await writeAuditLog(tx, {
      communityId: pkg.communityId,
      userId: actor.id,
      action: "PACKAGE_PICKED_UP",
      entity: "Package",
      entityId: pkg.id,
    });

    return updated;
  });
}

export async function listPackagesForViewer(
  actor: SessionUser,
  communityId: string,
  filters: { search?: string } = {},
) {
  const staffMembership = actor.memberships.find(
    (m) => m.communityId === communityId && STAFF_ROLES.includes(m.role),
  );

  const search = filters.search?.trim();
  const searchFilter: Prisma.PackageWhereInput = search
    ? {
        OR: [
          { trackingNumber: { contains: search, mode: "insensitive" } },
          { apartment: { number: { contains: search, mode: "insensitive" } } },
          { recipient: { email: { contains: search, mode: "insensitive" } } },
        ],
      }
    : {};

  if (staffMembership) {
    return prisma.package.findMany({
      where: { communityId, ...searchFilter },
      include: { apartment: true, building: true, recipient: true },
      orderBy: { createdAt: "desc" },
    });
  }

  const residentMembership = actor.memberships.find(
    (m) => m.communityId === communityId,
  );
  if (!residentMembership) {
    throw new UnauthorizedError(
      `User ${actor.id} has no membership in community ${communityId}`,
    );
  }

  const residentFilters: Prisma.PackageWhereInput[] = [
    { recipientUserId: actor.id },
  ];
  const apartmentIds = residentApartmentIds(actor, communityId);
  if (apartmentIds.length > 0) {
    residentFilters.push({ apartmentId: { in: apartmentIds } });
  }

  return prisma.package.findMany({
    where: { communityId, OR: residentFilters },
    include: { apartment: true, building: true, recipient: true },
    orderBy: { createdAt: "desc" },
  });
}
