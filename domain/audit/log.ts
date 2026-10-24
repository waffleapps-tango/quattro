import type { Prisma } from "@/lib/generated/prisma";

export type AuditAction =
  | "PACKAGE_CREATED"
  | "PACKAGE_PICKED_UP"
  | "MEMBERSHIP_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_REMOVED"
  | "REPORT_CREATED"
  | "REPORT_STATUS_CHANGED"
  | "PACKAGE_REMINDER_SENT"
  | "COMMUNITY_SETTINGS_CHANGED"
  | "RESIDENCY_ADDED"
  | "RESIDENCY_REMOVED";

export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  params: {
    communityId: string;
    userId: string | null;
    action: AuditAction;
    entity: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      communityId: params.communityId,
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
