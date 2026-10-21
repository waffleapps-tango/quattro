import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { UnauthorizedError } from "@/domain/errors";
import { listOwnedSpaces } from "@/domain/reports";

export async function getProfile(actor: SessionUser, communityId: string) {
  const own = actor.memberships.find((m) => m.communityId === communityId);
  if (!own) {
    throw new UnauthorizedError(
      `User ${actor.id} has no membership in community ${communityId}`,
    );
  }

  const [membership, owned] = await Promise.all([
    prisma.membership.findUniqueOrThrow({
      where: { id: own.id },
      include: {
        community: true,
        building: true,
        apartment: { include: { building: true } },
      },
    }),
    listOwnedSpaces(actor, communityId),
  ]);

  const building = membership.building ?? membership.apartment?.building ?? null;

  return {
    firstName: actor.firstName,
    lastName: actor.lastName,
    email: actor.email,
    role: membership.role,
    community: { name: membership.community.name, address: membership.community.address },
    building: building ? { name: building.name, address: building.address } : null,
    apartment: membership.apartment
      ? { number: membership.apartment.number, floor: membership.apartment.floor }
      : null,
    parkingSpaces: owned.parkingSpaces.map((s) => ({
      id: s.id,
      number: s.number,
      level: s.level,
      hasEvCharger: s.hasEvCharger,
    })),
    storageUnits: owned.storageUnits.map((u) => ({ id: u.id, number: u.number })),
  };
}

export type Profile = Awaited<ReturnType<typeof getProfile>>;
