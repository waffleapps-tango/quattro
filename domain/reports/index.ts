import prisma from "@/lib/prisma";
import { requireMembership, residentApartmentIds, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import {
  InvalidTransitionError,
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import {
  ReportVisibility,
  Prisma,
  Role,
  type ReportStatus,
  type ReportType,
} from "@/lib/generated/prisma";
import { getCategory } from "./catalog";
import { canTransition } from "./transitions";

const STAFF_ROLES: Role[] = [Role.RECEPTIONIST, Role.MANAGER, Role.ADMIN];
const APPROVER_ROLES: Role[] = [Role.MANAGER, Role.ADMIN];
const FINAL_STATUSES: ReportStatus[] = ["RESOLVED", "APPROVED", "REJECTED", "CLOSED"];

const reportInclude = {
  author: { select: { firstName: true, lastName: true, email: true } },
  apartment: true,
  building: true,
  parkingSpace: true,
  storageUnit: true,
} satisfies Prisma.ReportInclude;

export type ReportListItem = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

// Residents must not receive other authors' identity (it would ship in the RSC payload).
function maskAuthor<T extends ReportListItem>(report: T, actor: SessionUser, isStaff: boolean): T {
  if (isStaff || report.authorId === actor.id) return report;
  return { ...report, author: { firstName: null, lastName: null, email: "" } };
}

function membershipIn(actor: SessionUser, communityId: string) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  if (!membership) {
    throw new UnauthorizedError(
      `User ${actor.id} has no membership in community ${communityId}`,
    );
  }
  return membership;
}

export async function createReport(
  actor: SessionUser,
  input: {
    communityId: string;
    categoryKey: string;
    type: ReportType;
    title: string;
    description: string;
    urgent?: boolean;
    parkingSpaceId?: string;
    storageUnitId?: string;
    apartmentId?: string;
  },
) {
  membershipIn(actor, input.communityId);

  const category = getCategory(input.categoryKey);
  if (!category) throw new ValidationError(`Unknown category ${input.categoryKey}`);
  if (!category.types.includes(input.type)) {
    throw new ValidationError(`Category ${category.key} does not allow type ${input.type}`);
  }

  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || !description) {
    throw new ValidationError("Title and description are required");
  }

  if (category.subject !== "parking" && input.parkingSpaceId) {
    throw new ValidationError(`Category ${category.key} does not take a parking space`);
  }
  if (category.subject !== "storage" && input.storageUnitId) {
    throw new ValidationError(`Category ${category.key} does not take a storage unit`);
  }
  if (category.subject === "parking" && !input.parkingSpaceId) {
    throw new ValidationError("A parking space is required for this category");
  }
  if (category.subject === "storage" && !input.storageUnitId) {
    throw new ValidationError("A storage unit is required for this category");
  }

  const residentApartments = residentApartmentIds(actor, input.communityId);
  const isPrivate = category.visibility === "PRIVATE";
  let apartmentId: string | undefined;
  if (isPrivate) {
    if (residentApartments.length === 0) {
      throw new UnauthorizedError(`User ${actor.id} has no apartment to file a private report for`);
    }
    apartmentId =
      input.apartmentId ?? (residentApartments.length === 1 ? residentApartments[0] : undefined);
    if (!apartmentId && (input.parkingSpaceId || input.storageUnitId)) {
      // Several apartments: the named space/unit tells us which one is meant.
      const owner = input.parkingSpaceId
        ? await prisma.parkingSpace.findUnique({ where: { id: input.parkingSpaceId }, select: { apartmentId: true } })
        : await prisma.storageUnit.findUnique({ where: { id: input.storageUnitId }, select: { apartmentId: true } });
      if (owner?.apartmentId && residentApartments.includes(owner.apartmentId)) apartmentId = owner.apartmentId;
    }
    if (!apartmentId) throw new ValidationError("An apartment is required for this report");
    if (!residentApartments.includes(apartmentId)) {
      throw new UnauthorizedError(`User ${actor.id} does not live in apartment ${apartmentId}`);
    }
  }
  // Spaces must belong to the chosen apartment for private reports, else to any of the user's.
  const ownedApartments = apartmentId ? [apartmentId] : residentApartments;

  return prisma.$transaction(async (tx) => {
    if (input.parkingSpaceId) {
      const space = await tx.parkingSpace.findUnique({ where: { id: input.parkingSpaceId } });
      if (
        !space ||
        space.communityId !== input.communityId ||
        !space.apartmentId ||
        !ownedApartments.includes(space.apartmentId)
      ) {
        throw new TenantMismatchError(
          `Parking space ${input.parkingSpaceId} is not assigned to the reporter's apartment`,
        );
      }
    }
    if (input.storageUnitId) {
      const unit = await tx.storageUnit.findUnique({ where: { id: input.storageUnitId } });
      if (
        !unit ||
        unit.communityId !== input.communityId ||
        !unit.apartmentId ||
        !ownedApartments.includes(unit.apartmentId)
      ) {
        throw new TenantMismatchError(
          `Storage unit ${input.storageUnitId} is not assigned to the reporter's apartment`,
        );
      }
    }

    const apartment = apartmentId
      ? await tx.apartment.findUnique({ where: { id: apartmentId }, select: { buildingId: true } })
      : null;

    const report = await tx.report.create({
      data: {
        communityId: input.communityId,
        buildingId: apartment?.buildingId ?? null,
        apartmentId: apartmentId ?? null,
        parkingSpaceId: input.parkingSpaceId,
        storageUnitId: input.storageUnitId,
        authorId: actor.id,
        category: category.key,
        type: input.type,
        visibility: category.visibility,
        title,
        description,
        urgent: input.urgent ?? false,
      },
    });

    await writeAuditLog(tx, {
      communityId: input.communityId,
      userId: actor.id,
      action: "REPORT_CREATED",
      entity: "Report",
      entityId: report.id,
      metadata: { category: category.key, type: input.type, visibility: category.visibility },
    });

    return report;
  });
}

export async function listReports(
  actor: SessionUser,
  communityId: string,
  filters: {
    visibility?: ReportVisibility;
    status?: ReportStatus;
    category?: string;
    urgent?: boolean;
    mine?: boolean;
  } = {},
): Promise<ReportListItem[]> {
  const membership = membershipIn(actor, communityId);
  const and: Prisma.ReportWhereInput[] = [];

  if (!STAFF_ROLES.includes(membership.role)) {
    and.push({
      OR: [{ visibility: ReportVisibility.PUBLIC }, { authorId: actor.id }],
    });
  }
  if (filters.mine) and.push({ authorId: actor.id });
  if (filters.visibility) and.push({ visibility: filters.visibility });
  if (filters.status) and.push({ status: filters.status });
  if (filters.category) and.push({ category: filters.category });
  if (filters.urgent) and.push({ urgent: true });

  const reports = await prisma.report.findMany({
    where: { communityId, AND: and },
    include: reportInclude,
    orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
  });
  const isStaff = STAFF_ROLES.includes(membership.role);
  return reports.map((r) => maskAuthor(r, actor, isStaff));
}

export async function getReport(actor: SessionUser, reportId: string): Promise<ReportListItem> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: reportInclude,
  });
  if (!report) throw new NotFoundError(`Report ${reportId} not found`);

  const membership = membershipIn(actor, report.communityId);
  const isStaff = STAFF_ROLES.includes(membership.role);
  if (!isStaff && report.visibility === "PRIVATE" && report.authorId !== actor.id) {
    throw new NotFoundError(`Report ${reportId} not found`);
  }
  return maskAuthor(report, actor, isStaff);
}

export async function changeStatus(
  actor: SessionUser,
  reportId: string,
  status: ReportStatus,
) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new NotFoundError(`Report ${reportId} not found`);

  const allowedRoles = status === "APPROVED" || status === "REJECTED" ? APPROVER_ROLES : STAFF_ROLES;
  requireMembership(actor, report.communityId, allowedRoles);

  if (!canTransition(report.type, report.status, status)) {
    throw new InvalidTransitionError(
      `${report.type} report cannot go from ${report.status} to ${status}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    // Compare-and-set on the status we validated against, so a concurrent change loses.
    const updated = await tx.report
      .update({
        where: { id: reportId, status: report.status },
        data: {
          status,
          resolvedAt: FINAL_STATUSES.includes(status) ? new Date() : null,
        },
      })
      .catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          throw new InvalidTransitionError(
            `${report.type} report is no longer ${report.status}; cannot go to ${status}`,
          );
        }
        throw error;
      });

    await writeAuditLog(tx, {
      communityId: report.communityId,
      userId: actor.id,
      action: "REPORT_STATUS_CHANGED",
      entity: "Report",
      entityId: reportId,
      metadata: { from: report.status, to: status },
    });

    return updated;
  });
}

export async function listOwnedSpaces(actor: SessionUser, communityId: string) {
  membershipIn(actor, communityId);
  const apartmentIds = residentApartmentIds(actor, communityId);
  if (apartmentIds.length === 0) return { parkingSpaces: [], storageUnits: [] };

  const [parkingSpaces, storageUnits] = await Promise.all([
    prisma.parkingSpace.findMany({
      where: { communityId, apartmentId: { in: apartmentIds } },
      orderBy: { number: "asc" },
    }),
    prisma.storageUnit.findMany({
      where: { communityId, apartmentId: { in: apartmentIds } },
      orderBy: { number: "asc" },
    }),
  ]);
  return { parkingSpaces, storageUnits };
}
