import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { requireInviter, isPendingUser } from "@/domain/memberships/invites";
import { maskPerson } from "@/domain/privacy/person";
import type { ResidencyKind } from "@/lib/generated/prisma";

export type OverviewResident = { id: string; name: string; kind: ResidencyKind; pending: boolean };
export type OverviewApartment = { id: string; number: string; floor: number | null; residents: OverviewResident[] };
export type OverviewBuilding = { id: string; name: string; apartments: OverviewApartment[] };

// Every building and flat with who is linked to it. Names follow the app-wide privacy rule:
// someone who hid their name is a placeholder for every viewer (their own row excepted).
export async function listApartmentOverview(actor: SessionUser, communityId: string): Promise<OverviewBuilding[]> {
  await requireInviter(actor, communityId);
  const buildings = await prisma.building.findMany({
    where: { communityId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      apartments: {
        select: {
          id: true,
          number: true,
          floor: true,
          residencies: {
            where: { communityId },
            orderBy: { createdAt: "asc" },
            select: {
              kind: true,
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, shareName: true, clerkUserId: true },
              },
            },
          },
        },
      },
    },
  });

  return buildings.map((b) => ({
    id: b.id,
    name: b.name,
    apartments: b.apartments
      .map((a) => ({
        id: a.id,
        number: a.number,
        floor: a.floor,
        residents: a.residencies.map(({ kind, user }) => {
          const { clerkUserId, ...person } = user;
          const masked = maskPerson(person, actor.id, { buildingName: b.name, apartmentNumber: a.number });
          return {
            id: person.id,
            name: [masked.firstName, masked.lastName].filter(Boolean).join(" ") || masked.email,
            kind,
            pending: isPendingUser({ clerkUserId }),
          };
        }),
      }))
      .sort((x, y) => x.number.localeCompare(y.number, undefined, { numeric: true })),
  }));
}
