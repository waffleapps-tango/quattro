"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setShareNameAction } from "@/actions/profile";

export function ShareNameToggle({ initial }: { initial: boolean }) {
  const t = useTranslations("profile.privacy");
  const [checked, setChecked] = useState(initial);
  const [busy, setBusy] = useState(false);

  const change = async (next: boolean) => {
    setBusy(true);
    setChecked(next);
    try {
      const result = await setShareNameAction(next);
      if (result.success) toast.success(result.message);
      else {
        setChecked(!next);
        toast.error(result.message);
      }
    } catch {
      setChecked(!next);
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3">
      <Switch id="share-name" checked={checked} disabled={busy} onCheckedChange={change} />
      <div className="space-y-1">
        <Label htmlFor="share-name">{t("shareName")}</Label>
        <p className="text-sm text-muted-foreground">{t("shareNameHint")}</p>
      </div>
    </div>
  );
}
