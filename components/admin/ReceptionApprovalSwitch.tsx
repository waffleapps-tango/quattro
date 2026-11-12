"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setReceptionCanApproveAction } from "@/actions/join-requests";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function ReceptionApprovalSwitch({ communityId, initial }: { communityId: string; initial: boolean }) {
  const t = useTranslations("admin.requests");
  const [checked, setChecked] = useState(initial);
  const [pending, startTransition] = useTransition();

  const change = (value: boolean) => {
    setChecked(value);
    startTransition(async () => {
      const result = await setReceptionCanApproveAction(communityId, value);
      if (result.success) toast.success(result.message);
      else {
        setChecked(!value);
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Switch id="reception-can-approve" checked={checked} onCheckedChange={change} disabled={pending} />
      <Label htmlFor="reception-can-approve">{t("receptionCanApprove")}</Label>
    </div>
  );
}
