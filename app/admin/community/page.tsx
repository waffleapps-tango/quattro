import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { AccessDenied } from "@/components/system/AccessDenied";
import { getCurrentUser, requireMembership } from "@/auth/session";
import prisma from "@/lib/prisma";
import { ReceptionInviteSwitch } from "@/components/admin/ReceptionInviteSwitch";
import { CommunityNameForm } from "@/components/admin/CommunityNameForm";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("admin") };
}

export default async function AdminCommunityPage() {
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

  const community = await prisma.community.findUniqueOrThrow({
    where: { id: membership.communityId },
    select: { name: true, receptionCanInvite: true },
  });
  return (
    <div className="space-y-6">
      <CommunityNameForm communityId={membership.communityId} name={community.name} />
      <ReceptionInviteSwitch communityId={membership.communityId} initial={community.receptionCanInvite} />
    </div>
  );
}
