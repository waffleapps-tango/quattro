import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { getCurrentUser } from "@/auth/session";
import { listOwnedSpaces, listReports } from "@/domain/reports";
import { listResidentApartments } from "@/domain/residencies";
import { engagementSummary } from "@/domain/engagement";
import { ReportsList } from "@/components/reports/ReportsList";
import {
  ReportStatus,
  ReportVisibility,
  Role,
} from "@/lib/generated/prisma";

type SearchParams = {
  view?: string;
  visibility?: string;
  status?: string;
  category?: string;
  urgent?: string;
};

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("reports") };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("reports");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: first membership's community, same as /packages; needs a
  // community switcher once a user can belong to more than one.
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const STAFF_ROLES: Role[] = [Role.RECEPTIONIST, Role.MANAGER, Role.ADMIN];
  const isStaff = STAFF_ROLES.includes(membership.role);
  const canApprove = membership.role === Role.MANAGER || membership.role === Role.ADMIN;

  const sp = await searchParams;
  const asEnum = <T extends string>(values: Record<string, T>, v?: string) =>
    v && Object.values(values).includes(v as T) ? (v as T) : undefined;

  const reports = await listReports(
    user,
    membership.communityId,
    isStaff
      ? {
          visibility: asEnum(ReportVisibility, sp.visibility),
          status: asEnum(ReportStatus, sp.status),
          category: sp.category,
          urgent: sp.urgent === "1",
        }
      : sp.view === "mine"
        ? { mine: true }
        : { visibility: ReportVisibility.PUBLIC },
  );

  const engagement = await engagementSummary(user, reports.map((r) => ({ type: "report" as const, id: r.id })));

  const { parkingSpaces, storageUnits } = await listOwnedSpaces(user, membership.communityId);
  const apartments = (await listResidentApartments(user, membership.communityId)).map((a) => ({
    id: a.id,
    label: `${a.building.name} / ${a.number}`,
  }));

  return (
    <div className="container mx-auto pb-8">
      <h1 className="text-2xl font-bold mb-6 sm:text-3xl">{t("title")}</h1>
      <ReportsList
        reports={reports}
        engagement={engagement}
        communityId={membership.communityId}
        isStaff={isStaff}
        canApprove={canApprove}
        canFilePrivate={apartments.length > 0}
        apartments={apartments}
        parkingSpaces={parkingSpaces}
        storageUnits={storageUnits}
      />
    </div>
  );
}
