import { cache } from "react";
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

export const DEFAULT_APP_NAME = "Quattro";
export const MAX_NAME_LENGTH = 60;

// Logged-out visitors have no community, so show the oldest one's name.
// ponytail: single-community deployments only; multi-tenant needs host/subdomain lookup.
export const getAppName = cache(async (): Promise<string> => {
  const community = await prisma.community.findFirst({
    orderBy: { createdAt: "asc" },
    select: { name: true },
  });
  return community?.name || DEFAULT_APP_NAME;
});

export async function getCommunityName(communityId: string): Promise<string> {
  const c = await prisma.community.findUniqueOrThrow({ where: { id: communityId }, select: { name: true } });
  return c.name;
}

export async function updateCommunityName(actor: SessionUser, communityId: string, rawName: string) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  if (!membership || (membership.role !== Role.ADMIN && membership.role !== Role.MANAGER)) {
    throw new UnauthorizedError(`User ${actor.id} may not rename community ${communityId}`);
  }
  const name = rawName.trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`name must be 1 to ${MAX_NAME_LENGTH} characters`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { name } });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "COMMUNITY_SETTINGS_CHANGED",
      entity: "Community",
      entityId: communityId,
      metadata: { name },
    });
  });
}
