"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setReceptionCanInviteAction } from "@/actions/memberships";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function ReceptionInviteSwitch({ communityId, initial }: { communityId: string; initial: boolean }) {
  const t = useTranslations("admin.communitySettings");
  const [checked, setChecked] = useState(initial);
  const [pending, startTransition] = useTransition();

  const change = (value: boolean) => {
    setChecked(value);
    startTransition(async () => {
      const result = await setReceptionCanInviteAction(communityId, value);
      if (result.success) toast.success(result.message);
      else {
        setChecked(!value);
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Switch id="reception-can-invite" checked={checked} onCheckedChange={change} disabled={pending} />
      <Label htmlFor="reception-can-invite">{t("receptionCanInvite")}</Label>
    </div>
  );
}
