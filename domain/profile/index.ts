import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { UnauthorizedError } from "@/domain/errors";
import { listOwnedSpaces } from "@/domain/reports";
import { listResidentApartments } from "@/domain/residencies";

export async function getProfile(actor: SessionUser, communityId: string) {
  const own = actor.memberships.find((m) => m.communityId === communityId);
  if (!own) {
    throw new UnauthorizedError(
      `User ${actor.id} has no membership in community ${communityId}`,
    );
  }

  const [membership, owned, apartments] = await Promise.all([
    prisma.membership.findUniqueOrThrow({
      where: { id: own.id },
      include: { community: true, building: true },
    }),
    listOwnedSpaces(actor, communityId),
    listResidentApartments(actor, communityId),
  ]);

  return {
    firstName: actor.firstName,
    lastName: actor.lastName,
    email: actor.email,
    role: membership.role,
    community: { name: membership.community.name, address: membership.community.address },
    building: membership.building
      ? { name: membership.building.name, address: membership.building.address }
      : null,
    apartments: apartments.map((a) => ({
      id: a.id,
      number: a.number,
      floor: a.floor,
      building: { name: a.building.name, address: a.building.address },
    })),
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
