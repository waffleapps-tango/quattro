import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

export const MAX_UNREGISTERED_DAYS = 365;

function roleIn(actor: SessionUser, communityId: string) {
  return actor.memberships.find((m) => m.communityId === communityId)?.role;
}

async function save(actor: SessionUser, communityId: string, data: Record<string, number | boolean>) {
  await prisma.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "COMMUNITY_SETTINGS_CHANGED",
      entity: "Community",
      entityId: communityId,
      metadata: data,
    });
  });
}

export async function updateUnregisteredDays(actor: SessionUser, communityId: string, days: number) {
  const role = roleIn(actor, communityId);
  if (role !== Role.ADMIN && role !== Role.MANAGER) {
    throw new UnauthorizedError(`User ${actor.id} may not change community ${communityId} settings`);
  }
  if (!Number.isInteger(days) || days < 1 || days > MAX_UNREGISTERED_DAYS) {
    throw new ValidationError(`days must be an integer 1 to ${MAX_UNREGISTERED_DAYS}`);
  }
  await save(actor, communityId, { unregisteredDays: days });
}

// Managers may grant reception the right to hide comments; only an admin may grant it to managers.
export async function updateCommentModeration(
  actor: SessionUser,
  communityId: string,
  input: { receptionCanHideComments?: boolean; managerCanHideComments?: boolean },
) {
  const role = roleIn(actor, communityId);
  if (role !== Role.ADMIN && role !== Role.MANAGER) {
    throw new UnauthorizedError(`User ${actor.id} may not change community ${communityId} settings`);
  }
  if (input.managerCanHideComments !== undefined && role !== Role.ADMIN) {
    throw new UnauthorizedError(`User ${actor.id} may not change the manager moderation setting`);
  }
  const data: Record<string, boolean> = {};
  if (input.receptionCanHideComments !== undefined) data.receptionCanHideComments = input.receptionCanHideComments;
  if (input.managerCanHideComments !== undefined) data.managerCanHideComments = input.managerCanHideComments;
  if (Object.keys(data).length === 0) return;
  await save(actor, communityId, data);
}
