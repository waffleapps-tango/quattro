import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";
import { listPackagesForViewer } from "@/domain/packages";
import { listBuildingsForCommunity, listApartmentsForBuilding } from "@/domain/communities/queries";
import { PackagesList } from "@/components/packages/PackagesList";
import { Role, type Apartment } from "@/lib/generated/prisma";

export const metadata: Metadata = { title: "Paczki" };

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: picks the first membership's community. Fine while this
  // deployment serves a single community; a community switcher is needed
  // once a user can belong to more than one.
  const membership = user.memberships[0];
  if (!membership) {
    return (
      <div className="container mx-auto pb-8">
        <h1 className="text-3xl font-bold mb-6">Paczki</h1>
        <p className="text-muted-foreground">
          Nie masz jeszcze dostępu. Poproś administratora o zaproszenie.
        </p>
      </div>
    );
  }

  const { q } = await searchParams;
  const packages = await listPackagesForViewer(user, membership.communityId, { search: q });

  const STAFF_ROLES: Role[] = [Role.RECEPTIONIST, Role.MANAGER, Role.ADMIN];
  const isStaff = STAFF_ROLES.includes(membership.role);

  const buildings = isStaff
    ? await listBuildingsForCommunity(membership.communityId)
    : [];

  const apartmentLists = await Promise.all(
    buildings.map((building) => listApartmentsForBuilding(building.id)),
  );
  const apartmentsByBuilding = buildings.reduce<Record<string, Apartment[]>>(
    (acc, building, i) => {
      acc[building.id] = apartmentLists[i];
      return acc;
    },
    {},
  );

  return (
    <div className="container mx-auto pb-8">
      <h1 className="text-3xl font-bold mb-6">Paczki</h1>
      <PackagesList
        packages={packages}
        communityId={membership.communityId}
        buildings={buildings}
        apartmentsByBuilding={apartmentsByBuilding}
        isStaff={isStaff}
      />
    </div>
  );
}
