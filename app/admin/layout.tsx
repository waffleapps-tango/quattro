import { getTranslations } from "next-intl/server";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { getCurrentUser } from "@/auth/session";
import { Role } from "@/lib/generated/prisma";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("meta");
  const user = await getCurrentUser();
  const role = user?.memberships[0]?.role;
  // Pages render AccessDenied / WaitingScreen themselves; only admins get the admin chrome.
  if (role !== Role.ADMIN && role !== Role.MANAGER) return <>{children}</>;
  return (
    <div className="container mx-auto pb-8">
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">{t("admin")}</h1>
      <AdminTabs />
      {children}
    </div>
  );
}
