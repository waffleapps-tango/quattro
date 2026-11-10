import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { UnauthorizedError } from "@/domain/errors";
import { listOwnedSpaces } from "@/domain/reports";
import { listResidentApartments } from "@/domain/residencies";
import { maskPerson } from "@/domain/privacy/person";
import { livesHere } from "@/domain/residencies/occupancy";

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

  const apartmentIds = apartments.map((a) => a.id);
  const links = apartmentIds.length
    ? await prisma.apartmentResidency.findMany({
        where: { apartmentId: { in: apartmentIds } },
        include: { user: true },
        orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
      })
    : [];

  return {
    firstName: actor.firstName,
    lastName: actor.lastName,
    email: actor.email,
    role: membership.role,
    community: { name: membership.community.name, address: membership.community.address },
    building: membership.building
      ? { name: membership.building.name, address: membership.building.address }
      : null,
    apartments: apartments.map((a) => {
      const aptLinks = links.filter((l) => l.apartmentId === a.id);
      const hasTenant = aptLinks.some((l) => l.kind === "TENANT");
      const mine = aptLinks.find((l) => l.userId === actor.id);
      const iAmOwner = mine?.kind === "OWNER";
      return {
        id: a.id,
        number: a.number,
        floor: a.floor,
        building: { name: a.building.name, address: a.building.address },
        myLink: mine
          ? {
              id: mine.id,
              kind: mine.kind,
              receivesPackages: mine.receivesPackages,
              livesHereOverride: mine.livesHereOverride,
              livesHere: livesHere(mine, hasTenant),
            }
          : null,
        people: aptLinks.map((l) => {
          const u = maskPerson(l.user, actor.id, { buildingName: a.building.name, apartmentNumber: a.number });
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
          return {
            residencyId: l.id,
            // Owners see everyone's email; tenants only see names (null when unnamed).
            name: fullName || (iAmOwner ? u.email : null),
            email: iAmOwner ? u.email || null : null,
            kind: l.kind,
            isPrimary: l.isPrimary,
            receivesPackages: l.receivesPackages,
            livesHere: livesHere(l, hasTenant),
            isMe: l.userId === actor.id,
          };
        }),
      };
    }),
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

export async function setShareName(actor: SessionUser, share: boolean): Promise<void> {
  await prisma.user.update({ where: { id: actor.id }, data: { shareName: share } });
}
