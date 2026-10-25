import type { SessionUser } from "@/auth/session";
import { Role } from "@/lib/generated/prisma";

export const MANAGE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

export function isCommunityManager(actor: SessionUser, communityId: string): boolean {
  return actor.memberships.some(
    (m) => m.communityId === communityId && MANAGE_ROLES.includes(m.role),
  );
}

export function isApartmentOwner(actor: SessionUser, apartmentId: string): boolean {
  return actor.residencies.some((r) => r.apartmentId === apartmentId && r.kind === "OWNER");
}

// Owners manage their own apartment; admins and managers manage any apartment in their community.
export function canManageApartment(
  actor: SessionUser,
  communityId: string,
  apartmentId: string,
): boolean {
  return isCommunityManager(actor, communityId) || isApartmentOwner(actor, apartmentId);
}
