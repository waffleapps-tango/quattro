import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { AccessDenied } from "@/components/system/AccessDenied";
import { getCurrentUser } from "@/auth/session";
import { requireInviter } from "@/domain/memberships/invites";
import { listApartmentOverview } from "@/domain/residencies/overview";
import { ApartmentsOverview } from "@/components/admin/ApartmentsOverview";
import { UnauthorizedError } from "@/domain/errors";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("admin") };
}

export default async function AdminApartmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  try {
    await requireInviter(user, membership.communityId);
  } catch (error) {
    if (error instanceof UnauthorizedError) return <AccessDenied />;
    throw error;
  }

  return (
    <ApartmentsOverview
      communityId={membership.communityId}
      buildings={await listApartmentOverview(user, membership.communityId)}
    />
  );
}
