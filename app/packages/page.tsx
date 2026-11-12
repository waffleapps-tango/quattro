import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { getCurrentUser } from "@/auth/session";
import { listPackagesForViewer } from "@/domain/packages";
import { listBuildingsForCommunity, listApartmentsForBuilding } from "@/domain/communities/queries";
import { PackagesList } from "@/components/packages/PackagesList";
import { CreatePackageForm } from "@/components/packages/CreatePackageForm";
import { parsePackageQuery } from "@/domain/packages/query";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { type Apartment } from "@/lib/generated/prisma";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("packages") };
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("packages");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: picks the first membership's community. Fine while this
  // deployment serves a single community; a community switcher is needed
  // once a user can belong to more than one.
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const query = parsePackageQuery(await searchParams);
  const { items, total, page, pageSize } = await listPackagesForViewer(user, membership.communityId, query);

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        {isStaff && (
          <CreatePackageForm
            communityId={membership.communityId}
            buildings={buildings}
            apartmentsByBuilding={apartmentsByBuilding}
          />
        )}
      </div>
      <PackagesList
        packages={items}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        buildings={buildings}
        isStaff={isStaff}
      />
    </div>
  );
}
