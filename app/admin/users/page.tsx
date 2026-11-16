import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { AccessDenied } from "@/components/system/AccessDenied";
import { getCurrentUser, requireMembership } from "@/auth/session";
import { listMembershipsForCommunity } from "@/domain/memberships";
import { listBuildingsForCommunity } from "@/domain/communities/queries";
import { MembershipsTable } from "@/components/admin/MembershipsTable";
import { NavPending } from "@/components/system/nav-pending";
import { MembershipsFilter } from "@/components/admin/MembershipsFilter";
import { CreateMembershipForm } from "@/components/admin/CreateMembershipForm";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("admin") };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  const params = await searchParams;
  const text = (v: string | string[] | undefined, max: number) =>
    typeof v === "string" && v.length <= max ? v : undefined;
  // "Przypisz" on the requests tab lands here with the person's email to prefill the add dialog.
  const invite = text(params.invite, 254);
  const defaultEmail = invite?.includes("@") ? invite : undefined;
  const filters = {
    buildingId: text(params.building, 64),
    apartmentId: text(params.apartment, 64),
    q: text(params.q, 100)?.trim() || undefined,
  };

  const memberships = await listMembershipsForCommunity(user, membership.communityId, filters);
  const buildings = await listBuildingsForCommunity(membership.communityId);

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <CreateMembershipForm
          key={defaultEmail ?? ""}
          defaultEmail={defaultEmail}
          defaultOpen={Boolean(defaultEmail)}
          communityId={membership.communityId}
          buildings={buildings}
        />
      </div>
      <MembershipsFilter
        communityId={membership.communityId}
        buildings={buildings.map(({ id, name }) => ({ id, name }))}
        {...filters}
      />
      <NavPending>
        <MembershipsTable memberships={memberships} filtered={Object.values(filters).some(Boolean)} />
      </NavPending>
    </div>
  );
}
