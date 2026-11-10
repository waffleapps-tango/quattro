import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { FadeIn } from "@/components/motion/FadeIn";

export async function generateMetadata(): Promise<Metadata> {
  const [m, t] = await Promise.all([getTranslations("meta"), getTranslations("settings")]);
  return { title: m("settings"), description: t("metaDescription") };
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </FadeIn>
      <SettingsForm />
    </div>
  );
}
