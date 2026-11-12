import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { AccessDenied } from "@/components/system/AccessDenied";
import { getCurrentUser, requireMembership } from "@/auth/session";
import { listMembershipsForCommunity } from "@/domain/memberships";
import { listBuildingsForCommunity, listApartmentsForBuilding } from "@/domain/communities/queries";
import { MembershipsTable } from "@/components/admin/MembershipsTable";
import { CreateMembershipForm } from "@/components/admin/CreateMembershipForm";
import { UnassignedClerkUsers } from "@/components/admin/UnassignedClerkUsers";
import { Role, type Apartment } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("admin") };
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  try {
    requireMembership(user, membership.communityId, [Role.ADMIN, Role.MANAGER]);
  } catch (error) {
    if (error instanceof UnauthorizedError) return <AccessDenied />;
    throw error;
  }

  const memberships = await listMembershipsForCommunity(user, membership.communityId);
  const buildings = await listBuildingsForCommunity(membership.communityId);
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
    <div>
      <div className="mb-6 flex justify-end">
        <CreateMembershipForm
          communityId={membership.communityId}
          buildings={buildings}
          apartmentsByBuilding={apartmentsByBuilding}
        />
      </div>
      <UnassignedClerkUsers />
      <MembershipsTable memberships={memberships} />
    </div>
  );
}
