import type { Prisma } from "@/lib/generated/prisma";

export type AuditAction =
  | "PACKAGE_CREATED"
  | "COMMENT_DELETED"
  | "POST_CREATED"
  | "POST_UPDATED"
  | "POST_DELETED"
  | "INFO_SECTION_CREATED"
  | "INFO_SECTION_UPDATED"
  | "INFO_SECTION_DELETED"
  | "PACKAGE_PICKED_UP"
  | "MEMBERSHIP_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_REMOVED"
  | "REPORT_CREATED"
  | "RESIDENCY_PREFS_CHANGED"
  | "PRIMARY_CONTACT_CHANGED"
  | "REPORT_STATUS_CHANGED"
  | "PACKAGE_REMINDER_SENT"
  | "COMMUNITY_SETTINGS_CHANGED"
  | "RESIDENCY_ADDED"
  | "RESIDENCY_REMOVED"
  | "JOIN_REQUEST_CREATED"
  | "JOIN_REQUEST_APPROVED"
  | "JOIN_REQUEST_REJECTED"
  | "MEMBERSHIP_INVITE_SENT";

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
