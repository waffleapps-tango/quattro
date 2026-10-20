import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";
import { listOwnedSpaces, listReports } from "@/domain/reports";
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: first membership's community, same as /packages; needs a
  // community switcher once a user can belong to more than one.
  const membership = user.memberships[0];
  if (!membership) {
    return (
      <div className="container mx-auto pb-8">
        <h1 className="text-3xl font-bold mb-6">Zgłoszenia</h1>
        <p className="text-muted-foreground">
          Nie masz jeszcze dostępu. Poproś administratora o zaproszenie.
        </p>
      </div>
    );
  }

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

  const { parkingSpaces, storageUnits } = await listOwnedSpaces(user, membership.communityId);

  return (
    <div className="container mx-auto pb-8">
      <h1 className="text-3xl font-bold mb-6">Zgłoszenia</h1>
      <ReportsList
        reports={reports}
        communityId={membership.communityId}
        isStaff={isStaff}
        canApprove={canApprove}
        canFilePrivate={Boolean(membership.apartmentId)}
        parkingSpaces={parkingSpaces}
        storageUnits={storageUnits}
      />
    </div>
  );
}
