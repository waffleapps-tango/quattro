import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, TenantMismatchError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

export async function listMembershipsForCommunity(
  actor: SessionUser,
  communityId: string,
) {
  requireMembership(actor, communityId, [Role.ADMIN, Role.MANAGER]);

  return prisma.membership.findMany({
    where: { communityId },
    include: {
      building: true,
      user: {
        include: {
          residencies: {
            where: { communityId },
            include: { apartment: { include: { building: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMembership(
  actor: SessionUser,
  input: {
    communityId: string;
    email: string;
    buildingId?: string;
    role: Role;
  },
) {
  requireMembership(actor, input.communityId, [Role.ADMIN, Role.MANAGER]);

  return prisma.$transaction(async (tx) => {
    if (input.buildingId) {
      const building = await tx.building.findUnique({ where: { id: input.buildingId } });
      if (!building || building.communityId !== input.communityId) {
        throw new TenantMismatchError(
          `Building ${input.buildingId} does not belong to community ${input.communityId}`,
        );
      }
    }

    const user =
      (await tx.user.findUnique({ where: { email: input.email } })) ??
      (await tx.user.create({
        data: { email: input.email, clerkUserId: `pending:${input.email}` },
      }));

    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        communityId: input.communityId,
        buildingId: input.buildingId,
        role: input.role,
      },
    });

    await writeAuditLog(tx, {
      communityId: input.communityId,
      userId: actor.id,
      action: "MEMBERSHIP_CREATED",
      entity: "Membership",
      entityId: membership.id,
      metadata: { targetEmail: input.email, role: input.role },
    });

    return membership;
  });
}

export async function updateMembershipRole(
  actor: SessionUser,
  membershipId: string,
  newRole: Role,
) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
  });
  if (!membership) throw new NotFoundError(`Membership ${membershipId} not found`);

  requireMembership(actor, membership.communityId, [Role.ADMIN, Role.MANAGER]);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: { role: newRole },
    });

    await writeAuditLog(tx, {
      communityId: membership.communityId,
      userId: actor.id,
      action: "USER_ROLE_CHANGED",
      entity: "Membership",
      entityId: membershipId,
      metadata: { from: membership.role, to: newRole },
    });

    return updated;
  });
}

export async function removeMembership(actor: SessionUser, membershipId: string) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
  });
  if (!membership) throw new NotFoundError(`Membership ${membershipId} not found`);

  requireMembership(actor, membership.communityId, [Role.ADMIN, Role.MANAGER]);

  return prisma.$transaction(async (tx) => {
    await tx.apartmentResidency.deleteMany({
      where: { userId: membership.userId, communityId: membership.communityId },
    });
    await tx.membership.delete({ where: { id: membershipId } });

    await writeAuditLog(tx, {
      communityId: membership.communityId,
      userId: actor.id,
      action: "USER_REMOVED",
      entity: "Membership",
      entityId: membershipId,
    });
  });
}
