import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { getCurrentUser } from "@/auth/session";
import { listPackagesForViewer } from "@/domain/packages";
import { listBuildingsForCommunity, listApartmentsForBuilding } from "@/domain/communities/queries";
import { canEditNotificationSettings, getReminderAfterDays } from "@/domain/notifications/settings";
import { PackagesList } from "@/components/packages/PackagesList";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { type Apartment } from "@/lib/generated/prisma";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("packages") };
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const t = await getTranslations("packages");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: picks the first membership's community. Fine while this
  // deployment serves a single community; a community switcher is needed
  // once a user can belong to more than one.
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const { q } = await searchParams;
  const packages = await listPackagesForViewer(user, membership.communityId, { search: q });

  const isStaff = STAFF_ROLES.includes(membership.role);

  const reminderAfterDays = isStaff ? await getReminderAfterDays(membership.communityId) : null;
  const canEditReminders = canEditNotificationSettings(membership);

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
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <PackagesList
        packages={packages}
        communityId={membership.communityId}
        buildings={buildings}
        apartmentsByBuilding={apartmentsByBuilding}
        isStaff={isStaff}
        reminderAfterDays={reminderAfterDays}
        canEditReminders={canEditReminders}
      />
    </div>
  );
}
