import prisma from "@/lib/prisma";

export function listBuildingsForCommunity(communityId: string) {
  return prisma.building.findMany({
    where: { communityId },
    orderBy: { name: "asc" },
  });
}

export function listApartmentsForBuilding(buildingId: string) {
  return prisma.apartment.findMany({
    where: { buildingId },
    orderBy: { number: "asc" },
  });
}
