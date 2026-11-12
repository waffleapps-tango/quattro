import { getTranslations } from "next-intl/server";
import { AdminTabs, type AdminTab } from "@/components/admin/AdminTabs";
import { getCurrentUser } from "@/auth/session";
import { countPendingJoinRequests, requireApprover } from "@/domain/join-requests";
import { UnauthorizedError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("meta");
  const user = await getCurrentUser();
  const membership = user?.memberships[0];
  // Pages render AccessDenied / WaitingScreen themselves. Admins get every tab; a receptionist
  // only gets the requests tab, and only while the community lets reception decide them.
  let tabs: AdminTab[] | null = null;
  if (user && membership) {
    if (membership.role === Role.ADMIN || membership.role === Role.MANAGER) {
      tabs = ["users", "requests", "notifications"];
    } else if (membership.role === Role.RECEPTIONIST) {
      try {
        await requireApprover(user, membership.communityId);
        tabs = ["requests"];
      } catch (error) {
        if (!(error instanceof UnauthorizedError)) throw error;
      }
    }
  }
  if (!tabs || !membership) return <>{children}</>;
  return (
    <div className="container mx-auto pb-8">
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">{t("admin")}</h1>
      <AdminTabs tabs={tabs} pendingCount={await countPendingJoinRequests(membership.communityId)} />
      {children}
    </div>
  );
}
