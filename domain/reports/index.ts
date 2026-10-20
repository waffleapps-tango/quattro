import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
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
  Role,
  type Prisma,
  type ReportStatus,
  type ReportType,
} from "@/lib/generated/prisma";
import { getCategory } from "./catalog";
import { canTransition } from "./transitions";

const STAFF_ROLES: Role[] = [Role.RECEPTIONIST, Role.MANAGER, Role.ADMIN];
const APPROVER_ROLES: Role[] = [Role.MANAGER, Role.ADMIN];
const FINAL_STATUSES: ReportStatus[] = ["RESOLVED", "APPROVED", "REJECTED", "CLOSED"];

const reportInclude = {
  author: true,
  apartment: true,
  building: true,
  parkingSpace: true,
  storageUnit: true,
} satisfies Prisma.ReportInclude;

export type ReportListItem = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

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
  },
) {
  const membership = membershipIn(actor, input.communityId);

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

  const isPrivate = category.visibility === "PRIVATE";
  if (isPrivate && !membership.apartmentId) {
    throw new UnauthorizedError(`User ${actor.id} has no apartment to file a private report for`);
  }

  return prisma.$transaction(async (tx) => {
    if (input.parkingSpaceId) {
      const space = await tx.parkingSpace.findUnique({ where: { id: input.parkingSpaceId } });
      if (
        !space ||
        space.communityId !== input.communityId ||
        space.apartmentId !== membership.apartmentId
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
        unit.apartmentId !== membership.apartmentId
      ) {
        throw new TenantMismatchError(
          `Storage unit ${input.storageUnitId} is not assigned to the reporter's apartment`,
        );
      }
    }

    const report = await tx.report.create({
      data: {
        communityId: input.communityId,
        buildingId: isPrivate ? membership.buildingId : null,
        apartmentId: isPrivate ? membership.apartmentId : null,
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

  return prisma.report.findMany({
    where: { communityId, AND: and },
    include: reportInclude,
    orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
  });
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
  return report;
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
    const updated = await tx.report.update({
      where: { id: reportId },
      data: {
        status,
        resolvedAt: FINAL_STATUSES.includes(status) ? new Date() : null,
      },
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
  const membership = membershipIn(actor, communityId);
  if (!membership.apartmentId) return { parkingSpaces: [], storageUnits: [] };

  const [parkingSpaces, storageUnits] = await Promise.all([
    prisma.parkingSpace.findMany({
      where: { communityId, apartmentId: membership.apartmentId },
      orderBy: { number: "asc" },
    }),
    prisma.storageUnit.findMany({
      where: { communityId, apartmentId: membership.apartmentId },
      orderBy: { number: "asc" },
    }),
  ]);
  return { parkingSpaces, storageUnits };
}
