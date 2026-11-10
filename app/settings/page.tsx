import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { getCurrentUser } from "@/auth/session";
import { getPreferences } from "@/domain/notifications/preferences";
import { FadeIn } from "@/components/motion/FadeIn";

export async function generateMetadata(): Promise<Metadata> {
  const [m, t] = await Promise.all([getTranslations("meta"), getTranslations("settings")]);
  return { title: m("settings"), description: t("metaDescription") };
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const user = await getCurrentUser();
  const prefs = user ? await getPreferences(user.id) : { emailEnabled: false, smsEnabled: false, phone: null };
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </FadeIn>
      <SettingsForm initialNotifications={prefs} email={user?.email ?? ""} />
    </div>
  );
}
