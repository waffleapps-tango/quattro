import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { AccessDenied } from "@/components/system/AccessDenied";
import { getCurrentUser, requireMembership } from "@/auth/session";
import { canEditNotificationSettings, getReminderAfterDays } from "@/domain/notifications/settings";
import { ReminderSettings } from "@/components/admin/ReminderSettings";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("admin") };
}

export default async function AdminNotificationsPage() {
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

  return (
    <ReminderSettings
      communityId={membership.communityId}
      reminderAfterDays={await getReminderAfterDays(membership.communityId)}
      canEdit={canEditNotificationSettings(membership)}
    />
  );
}
