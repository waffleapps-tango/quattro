"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateCommentModerationAction } from "@/actions/community";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Flag = "receptionCanHideComments" | "managerCanHideComments";

export function CommentModerationSettings({
  communityId,
  reception,
  manager,
  isAdmin,
}: {
  communityId: string;
  reception: boolean;
  manager: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("admin.communitySettings");
  const [values, setValues] = useState({ receptionCanHideComments: reception, managerCanHideComments: manager });
  const [pending, startTransition] = useTransition();

  const change = (flag: Flag, value: boolean) => {
    setValues((v) => ({ ...v, [flag]: value }));
    startTransition(async () => {
      const result = await updateCommentModerationAction({ communityId, [flag]: value });
      if (result.success) toast.success(result.message);
      else {
        setValues((v) => ({ ...v, [flag]: !value }));
        toast.error(result.message);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("moderationTitle")}</CardTitle>
        <CardDescription>{t("moderationDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="reception-can-hide"
            checked={values.receptionCanHideComments}
            onCheckedChange={(v) => change("receptionCanHideComments", v)}
            disabled={pending}
          />
          <Label htmlFor="reception-can-hide">{t("receptionCanHide")}</Label>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Switch
              id="manager-can-hide"
              checked={values.managerCanHideComments}
              onCheckedChange={(v) => change("managerCanHideComments", v)}
              disabled={pending || !isAdmin}
            />
            <Label htmlFor="manager-can-hide">{t("managerCanHide")}</Label>
          </div>
          {!isAdmin && <p className="text-xs text-muted-foreground">{t("managerFlagAdminOnly")}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
