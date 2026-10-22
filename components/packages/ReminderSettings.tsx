"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateReminderSettingsAction } from "@/actions/notifications";

type ActionState = { message: string; success: boolean };

export function ReminderSettings({
  communityId,
  reminderAfterDays,
  canEdit,
}: {
  communityId: string;
  reminderAfterDays: number | null;
  canEdit: boolean;
}) {
  const t = useTranslations("packages.reminderSettings");
  const [enabled, setEnabled] = useState(reminderAfterDays !== null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateReminderSettingsAction,
    { message: "", success: false },
  );

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="communityId" value={communityId} />
          <div className="flex items-center gap-2">
            <Switch
              id="reminder-enabled"
              name="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!canEdit}
            />
            <Label htmlFor="reminder-enabled">{t("enabled")}</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reminder-days">{t("days")}</Label>
            <Input
              id="reminder-days"
              name="days"
              type="number"
              min={1}
              max={60}
              defaultValue={reminderAfterDays ?? 3}
              disabled={!canEdit || !enabled}
              className="w-24"
            />
          </div>
          {canEdit ? (
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
