import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import { Role, type Membership } from "@/lib/generated/prisma";

// Single seam for "who may change notification settings". Make this per-community
// configurable later by changing only this function.
export function canEditNotificationSettings(membership: Membership): boolean {
  return membership.role === Role.MANAGER || membership.role === Role.ADMIN;
}

export async function getReminderAfterDays(communityId: string): Promise<number | null> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { reminderAfterDays: true },
  });
  return community?.reminderAfterDays ?? null;
}

export async function updateReminderAfterDays(
  actor: SessionUser,
  communityId: string,
  days: number | null,
) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  if (!membership || !canEditNotificationSettings(membership)) {
    throw new UnauthorizedError(
      `User ${actor.id} may not edit notification settings in community ${communityId}`,
    );
  }
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 60)) {
    throw new ValidationError("reminderAfterDays must be an integer from 1 to 60");
  }

  await prisma.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { reminderAfterDays: days } });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "COMMUNITY_SETTINGS_CHANGED",
      entity: "Community",
      entityId: communityId,
      metadata: { reminderAfterDays: days },
    });
  });
}
