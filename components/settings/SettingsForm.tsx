"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { setLocaleAction } from "@/actions/locale";
import { ThemePicker } from "./ThemePicker";

export function SettingsForm() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState(true);
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
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("appearance.title")}</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>{t("notifications.title")}</CardTitle>
          <CardDescription>{t("notifications.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="notifications">{t("notifications.email")}</Label>
            <Switch
              id="notifications"
              checked={notifications}
              onCheckedChange={setNotifications}
            />
          </div>
        </CardContent>
      </Card>

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

      <div className="flex justify-end">
        <Button onClick={handleSave}>{t("save")}</Button>
      </div>
    </div>
  );
} 