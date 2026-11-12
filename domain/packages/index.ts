import prisma from "@/lib/prisma";
import { requireMembership, residentApartmentIds, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, TenantMismatchError, UnauthorizedError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { resolvePackageRecipients } from "@/domain/packages/reminders";
import { PACKAGE_PAGE_SIZE, parsePackageQuery, type PackageQuery } from "@/domain/packages/query";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { maskPerson, type Maskable } from "@/domain/privacy/person";
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
