import type { ResidencyKind } from "@/lib/generated/prisma";

type OccupancyLink = {
  kind: ResidencyKind;
  livesHereOverride: boolean | null;
};

// Single definition of "who lives here": used by recipient resolution, the reception
// select and the profile UI.
export function livesHere(link: OccupancyLink, apartmentHasTenant: boolean): boolean {
  if (link.kind === "TENANT") return true;
  return link.livesHereOverride ?? !apartmentHasTenant;
}

// "All residents": linked people who effectively live there and accept package notifications.
export function effectiveResidents<T extends OccupancyLink & { receivesPackages: boolean }>(
  links: T[],
): T[] {
  const hasTenant = links.some((l) => l.kind === "TENANT");
  return links.filter((l) => l.receivesPackages && livesHere(l, hasTenant));
}
