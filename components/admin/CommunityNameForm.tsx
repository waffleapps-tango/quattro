"use client";

import { useActionState, useEffect } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCommunityNameAction } from "@/actions/community";

export function CommunityNameForm({ communityId, name }: { communityId: string; name: string }) {
  const t = useTranslations("admin.communitySettings");
  const [state, formAction, pending] = useActionState(updateCommunityNameAction, { message: "", success: false });

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
        <form onSubmit={submitKeepingValues(formAction)} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="communityId" value={communityId} />
          <div className="space-y-1">
            <Label htmlFor="community-name">{t("name")}</Label>
            <Input id="community-name" name="name" defaultValue={name} maxLength={60} required className="w-72" />
          </div>
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
