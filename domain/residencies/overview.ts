import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { requireInviter, isPendingUser } from "@/domain/memberships/invites";
import { NotFoundError } from "@/domain/errors";
import { maskPerson } from "@/domain/privacy/person";
import type { ResidencyKind } from "@/lib/generated/prisma";

export type OverviewResident = { id: string; name: string; kind: ResidencyKind; pending: boolean };
export type OverviewApartment = { id: string; number: string; floor: number | null; residents: OverviewResident[] };
export type OverviewFloor = { floor: number | null; total: number; vacant: number };
export type OverviewBuilding = { id: string; name: string; floors: OverviewFloor[] };
export type ApartmentOption = { id: string; number: string; floor: number | null };

const byNumber = (x: { number: string }, y: { number: string }) =>
  x.number.localeCompare(y.number, undefined, { numeric: true });

// Floors ascending, flats without a floor last.
const byFloor = (x: { floor: number | null }, y: { floor: number | null }) =>
  x.floor === null ? (y.floor === null ? 0 : 1) : y.floor === null ? -1 : x.floor - y.floor;

// What an apartment row carries. A new Apartment field is added here and in listFloorApartments only.
const apartmentSelect = (communityId: string) =>
  ({
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
  }) as const;

// Counts only: one cheap call per page load, apartments are fetched per floor on demand.
export async function listBuildingFloors(actor: SessionUser, communityId: string): Promise<OverviewBuilding[]> {
  await requireInviter(actor, communityId);
  const [buildings, totals, occupied] = await Promise.all([
    prisma.building.findMany({ where: { communityId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.apartment.groupBy({ by: ["buildingId", "floor"], where: { building: { communityId } }, _count: { _all: true } }),
    prisma.apartment.groupBy({
      by: ["buildingId", "floor"],
      where: { building: { communityId }, residencies: { some: { communityId } } },
      _count: { _all: true },
    }),
  ]);
  const occupiedBy = new Map(occupied.map((o) => [`${o.buildingId}:${o.floor}`, o._count._all]));

  return buildings.map((b) => ({
    id: b.id,
    name: b.name,
    floors: totals
      .filter((t) => t.buildingId === b.id)
      .map((t) => ({ floor: t.floor, total: t._count._all, vacant: t._count._all - (occupiedBy.get(`${b.id}:${t.floor}`) ?? 0) }))
      .sort(byFloor),
  }));
}

// One floor's flats with who is linked to them. Names follow the app-wide privacy rule:
// someone who hid their name is a placeholder for every viewer (their own row excepted).
export async function listFloorApartments(
  actor: SessionUser,
  communityId: string,
  buildingId: string,
  floor: number | null,
  opts: { onlyVacant?: boolean } = {},
): Promise<OverviewApartment[]> {
  await requireInviter(actor, communityId);
  const building = await prisma.building.findFirst({ where: { id: buildingId, communityId }, select: { name: true } });
  if (!building) throw new NotFoundError(`Building ${buildingId} not found`);

  const rows = await prisma.apartment.findMany({
    where: { buildingId, floor, ...(opts.onlyVacant ? { residencies: { none: { communityId } } } : {}) },
    select: apartmentSelect(communityId),
  });

  return rows
    .map((a) => ({
      id: a.id,
      number: a.number,
      floor: a.floor,
      residents: a.residencies.map(({ kind, user }) => {
        const { clerkUserId, ...person } = user;
        const masked = maskPerson(person, actor.id, { buildingName: building.name, apartmentNumber: a.number });
        return {
          id: person.id,
          name: [masked.firstName, masked.lastName].filter(Boolean).join(" ") || masked.email,
          kind,
          pending: isPendingUser({ clerkUserId }),
        };
      }),
    }))
    .sort(byNumber);
}

// For selects (filters, add-member form): no residents, so cheap even for big buildings.
export async function listApartmentsLite(actor: SessionUser, communityId: string, buildingId: string): Promise<ApartmentOption[]> {
  await requireInviter(actor, communityId);
  const rows = await prisma.apartment.findMany({
    where: { buildingId, building: { communityId } },
    select: { id: true, number: true, floor: true },
  });
  return rows.sort(byNumber);
}
