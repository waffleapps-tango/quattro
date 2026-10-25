import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
import { TenantMismatchError } from "@/domain/errors";
import { STAFF_ROLES } from "@/domain/packages/roles";
import type { ResidencyKind } from "@/lib/generated/prisma";

export type PackageRecipientOptions = {
  default: { type: "primary"; userId: string; name: string } | { type: "all" };
  options: { userId: string; name: string; kind: ResidencyKind }[];
};

const displayName = (u: { firstName: string | null; lastName: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;

export async function getPackageRecipientOptions(
  actor: SessionUser,
  communityId: string,
  apartmentId: string,
): Promise<PackageRecipientOptions> {
  requireMembership(actor, communityId, STAFF_ROLES);

  const apartment = await prisma.apartment.findUnique({
    where: { id: apartmentId },
    include: { building: true },
  });
  if (!apartment || apartment.building.communityId !== communityId) {
    throw new TenantMismatchError(`Apartment ${apartmentId} does not belong to community ${communityId}`);
  }

  const links = await prisma.apartmentResidency.findMany({
    where: { apartmentId, receivesPackages: true },
    include: { user: true },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });

  const options = links.map((l) => ({ userId: l.userId, name: displayName(l.user), kind: l.kind }));
  const primary = links.find((l) => l.isPrimary);
  return {
    default: primary
      ? { type: "primary", userId: primary.userId, name: displayName(primary.user) }
      : { type: "all" },
    options,
  };
}
