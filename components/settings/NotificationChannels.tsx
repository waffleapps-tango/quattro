"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateNotificationPreferencesAction } from "@/actions/notifications";
import type { NotificationPreferences } from "@/domain/notifications/preferences";

export function NotificationChannels({
  initial,
  email,
}: {
  initial: NotificationPreferences;
  email: string;
}) {
  const t = useTranslations("settings.notifications");
  const [saved, setSaved] = useState(initial);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [busy, setBusy] = useState(false);

  const clean = (raw: string) => raw.replace(/[\s-]/g, "");

  const save = async (next: NotificationPreferences) => {
    setBusy(true);
    try {
      const res = await updateNotificationPreferencesAction(next);
      if (res.success) {
        setSaved(next);
        setPhone(next.phone ?? "");
        toast.success(res.message);
      } else {
        setPhone(saved.phone ?? "");
        toast.error(res.message);
      }
    } catch {
      setPhone(saved.phone ?? "");
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const savePhone = () => {
    const next = clean(phone) || null;
    if (next === saved.phone) return;
    // Clearing the number also turns SMS off.
    void save({ ...saved, phone: next, smsEnabled: next ? saved.smsEnabled : false });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="notif-inapp">{t("inApp")}</Label>
          <p className="text-sm text-muted-foreground">{t("inAppHint")}</p>
        </div>
        <Switch id="notif-inapp" checked disabled />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="notif-email">{t("email")}</Label>
          <p className="text-sm text-muted-foreground break-all">{t("emailHint", { email })}</p>
        </div>
        <Switch
          id="notif-email"
          checked={saved.emailEnabled}
          disabled={busy}
          onCheckedChange={(v) => save({ ...saved, emailEnabled: v })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="notif-sms">{t("sms")}</Label>
            <p className="text-sm text-muted-foreground">{t("smsHint")}</p>
          </div>
          <Switch
            id="notif-sms"
            checked={saved.smsEnabled}
            disabled={busy}
            onCheckedChange={(v) => save({ ...saved, smsEnabled: v, phone: clean(phone) || null })}
          />
        </div>
        <Label htmlFor="notif-phone" className="sr-only">
          {t("phoneLabel")}
        </Label>
        <Input
          id="notif-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t("phonePlaceholder")}
          value={phone}
          disabled={busy}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={savePhone}
        />
      </div>
    </div>
  );
}
