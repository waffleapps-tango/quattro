"use client";

import { useActionState, useEffect } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUnregisteredDaysAction } from "@/actions/community";

export function UnregisteredDaysForm({ communityId, days }: { communityId: string; days: number }) {
  const t = useTranslations("admin.communitySettings");
  const [state, formAction, pending] = useActionState(updateUnregisteredDaysAction, { message: "", success: false });

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("unregisteredDaysTitle")}</CardTitle>
        <CardDescription>{t("unregisteredDaysDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submitKeepingValues(formAction)} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="communityId" value={communityId} />
          <div className="space-y-1">
            <Label htmlFor="unregistered-days">{t("unregisteredDays")}</Label>
            <Input
              id="unregistered-days"
              name="days"
              type="number"
              min={1}
              max={365}
              step={1}
              defaultValue={days}
              required
              className="w-28"
            />
          </div>
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
