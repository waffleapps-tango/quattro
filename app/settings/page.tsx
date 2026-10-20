import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsForm } from "@/components/settings/SettingsForm";

export async function generateMetadata(): Promise<Metadata> {
  const [m, t] = await Promise.all([getTranslations("meta"), getTranslations("settings")]);
  return { title: m("settings"), description: t("metaDescription") };
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <SettingsForm />
    </div>
  );
}
