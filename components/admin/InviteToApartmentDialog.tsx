"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { submitKeepingValues } from "@/lib/form-submit";
import { inviteToApartmentAction } from "@/actions/memberships";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResidencyKind } from "@/lib/generated/prisma";

export function InviteToApartmentDialog({
  communityId,
  apartmentId,
  place,
}: {
  communityId: string;
  apartmentId: string;
  place: string;
}) {
  const t = useTranslations("admin.apartments");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ResidencyKind>(ResidencyKind.OWNER);
  const [state, formAction, pending] = useActionState(inviteToApartmentAction, { message: "", success: false });

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      setOpen(false);
    } else toast.error(state.message);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("invite")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle", { place })}</DialogTitle>
          <DialogDescription>{t("inviteDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submitKeepingValues(formAction)} className="space-y-4">
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="apartmentId" value={apartmentId} />
          <input type="hidden" name="kind" value={kind} />
          <div className="space-y-1">
            <Label htmlFor={`invite-email-${apartmentId}`}>{t("email")}</Label>
            <Input id={`invite-email-${apartmentId}`} name="email" type="email" required maxLength={254} />
          </div>
          <div className="space-y-1">
            <Label>{t("kind")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ResidencyKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ResidencyKind.OWNER}>{t("OWNER")}</SelectItem>
                <SelectItem value={ResidencyKind.TENANT}>{t("TENANT")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
