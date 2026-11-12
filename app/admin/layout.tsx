import { getTranslations } from "next-intl/server";
import { AdminTabs } from "@/components/admin/AdminTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("meta");
  return (
    <div className="container mx-auto pb-8">
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">{t("admin")}</h1>
      <AdminTabs />
      {children}
    </div>
  );
}
