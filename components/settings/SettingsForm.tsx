"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { setLocaleAction } from "@/actions/locale";
import { ThemePicker } from "./ThemePicker";
import { NotificationChannels } from "./NotificationChannels";
import type { NotificationPreferences } from "@/domain/notifications/preferences";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Switch } from "@/components/ui/switch";
import { Illustration, useIllustrationPref } from "@/components/system/Illustration";
import { ILLUSTRATION_SETS } from "@/components/system/illustration-prefs";
import { setIllustrationsAction } from "@/actions/illustrations";

export function SettingsForm({
  initialNotifications,
  email,
}: {
  initialNotifications: NotificationPreferences;
  email: string;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeLocale = (value: string) =>
    startTransition(async () => {
      const res = await setLocaleAction(value);
      if (!res.success) return void toast.error(t("languageError"));
      router.refresh();
    });

  const illustrations = useIllustrationPref();
  const changeIllustrations = (value: string) =>
    startTransition(async () => {
      const res = await setIllustrationsAction(value);
      if (!res.success) return void toast.error(t("illustrations.error"));
      router.refresh();
    });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSave = () => {
    // In a real app, you would save these settings to your backend
    toast.success(t("saved"));
  };

  if (!mounted) {
    return null;
  }

  return (
    <Stagger className="grid gap-6">
      <StaggerItem index={0}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Illustration name="settings" size={72} />
              {t("appearance.title")}
            </CardTitle>
            <CardDescription>{t("appearance.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="theme">{t("appearance.theme")}</Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t("appearance.themePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t("themes.light")}</SelectItem>
                  <SelectItem value="dark">{t("themes.dark")}</SelectItem>
                  <SelectItem value="system">{t("themes.system")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ThemePicker />
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem index={1}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Illustration name="bell" size={72} />
              {t("notifications.title")}
            </CardTitle>
            <CardDescription>{t("notifications.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationChannels initial={initialNotifications} email={email} />
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem index={2}>
        <Card>
          <CardHeader>
            <CardTitle>{t("illustrations.title")}</CardTitle>
            <CardDescription>{t("illustrations.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="illustrations">{t("illustrations.show")}</Label>
                <p className="text-sm text-muted-foreground">{t("illustrations.showHint")}</p>
              </div>
              <Switch
                id="illustrations"
                checked={illustrations !== "off"}
                onCheckedChange={(on) => changeIllustrations(on ? ILLUSTRATION_SETS[0] : "off")}
                disabled={pending}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="illustration-set">{t("illustrations.set")}</Label>
              <Select
                value={illustrations === "off" ? ILLUSTRATION_SETS[0] : illustrations}
                onValueChange={changeIllustrations}
                disabled={pending || illustrations === "off"}
              >
                <SelectTrigger id="illustration-set" className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ILLUSTRATION_SETS.map((set) => (
                    <SelectItem key={set} value={set}>
                      {t("illustrations.setName", { n: set })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {illustrations !== "off" && (
              <div className="flex justify-center gap-6 rounded-xl bg-muted p-4">
                <Illustration name="parcel" size={88} />
                <Illustration name="maintenance" size={88} />
                <Illustration name="bulletin" size={88} />
              </div>
            )}
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem index={3}>
          <Card>
            <CardHeader>
              <CardTitle>{t("language.title")}</CardTitle>
              <CardDescription>{t("language.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="language">{t("language.label")}</Label>
                <Select value={locale} onValueChange={changeLocale} disabled={pending}>
                  <SelectTrigger id="language" className="w-[180px]">
                    <SelectValue placeholder={t("language.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pl">Polski</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
      </StaggerItem>

      <StaggerItem index={4} className="flex justify-end">
          <Button onClick={handleSave}>{t("save")}</Button>
      </StaggerItem>
    </Stagger>
  );
} 