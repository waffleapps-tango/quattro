"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/motion/Collapse";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { createPackageAction, getPackageRecipientOptionsAction } from "@/actions/packages";
import type { PackageRecipientOptions } from "@/domain/residencies/recipients";
import type { Building, Apartment } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean; fieldErrors?: Record<string, string> };

export function CreatePackageForm({
  communityId,
  buildings,
  apartmentsByBuilding,
}: {
  communityId: string;
  buildings: Building[];
  apartmentsByBuilding: Record<string, Apartment[]>;
}) {
  const t = useTranslations("packages");
  const [open, setOpen] = useState(false);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const [apartmentId, setApartmentId] = useState("");
  const [recipient, setRecipient] = useState("DEFAULT");
  const [recipientOptions, setRecipientOptions] = useState<PackageRecipientOptions | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPackageAction,
    { message: "", success: false },
  );

  useEffect(() => {
    if (state.success && !pending) {
      setOpen(false);
      setRecipient("DEFAULT");
    }
  }, [state, pending]);

  useEffect(() => {
    setApartmentId("");
  }, [buildingId]);

  useEffect(() => {
    setRecipient("DEFAULT");
    setRecipientOptions(null);
    if (!apartmentId) return;
    let cancelled = false;
    getPackageRecipientOptionsAction(communityId, apartmentId).then((result) => {
      if (!cancelled && result.ok) setRecipientOptions(result.data);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apartmentId, communityId]);

  const apartments = apartmentsByBuilding[buildingId] ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="communityId" value={communityId} />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="buildingId">{t("building")}</Label>
              <Select
                name="buildingId"
                value={buildingId}
                onValueChange={setBuildingId}
              >
                <SelectTrigger id="buildingId">
                  <SelectValue placeholder={t("buildingPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="buildingId" value={buildingId} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apartmentId">{t("apartment")}</Label>
              <Select
                value={apartmentId}
                onValueChange={setApartmentId}
              >
                <SelectTrigger id="apartmentId">
                  <SelectValue placeholder={t("apartmentPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {apartments.map((apartment) => (
                    <SelectItem key={apartment.id} value={apartment.id}>
                      {apartment.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="apartmentId" value={apartmentId} />
              <Collapse show={Boolean(state.fieldErrors?.apartmentId) && !apartmentId}>
                <p className="text-sm text-destructive">
                  {apartments.length === 0
                    ? t("apartmentRequiredNoApartments")
                    : t("apartmentRequired")}
                </p>
              </Collapse>
            </div>
            <Collapse show={Boolean(apartmentId)} className="-mx-1 -mt-1 mb-0!">
              <div className="space-y-2 px-1 pt-1 pb-4">
                <Label htmlFor="recipient">{t("recipient")}</Label>
                <Select value={recipient} onValueChange={setRecipient}>
                  <SelectTrigger id="recipient">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">
                      {!recipientOptions
                        ? t("recipientDefault")
                        : recipientOptions.default.type === "primary"
                          ? t("recipientDefaultPrimary", { name: recipientOptions.default.name })
                          : t("recipientDefaultAll")}
                    </SelectItem>
                    <SelectItem value="ALL">{t("recipientAll")}</SelectItem>
                    {recipientOptions?.options.map((o) => (
                      <SelectItem key={o.userId} value={o.userId}>
                        {o.kind === "OWNER"
                          ? t("recipientOwner", { name: o.name })
                          : t("recipientTenant", { name: o.name })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="recipient" value={recipient === "DEFAULT" ? "" : recipient} />
              </div>
            </Collapse>
            <div className="space-y-2">
              <Label htmlFor="trackingNumber">{t("trackingNumber")}</Label>
              <Input id="trackingNumber" name="trackingNumber" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="courier">{t("courier")}</Label>
              <Input id="courier" name="courier" />
            </div>
          </div>
          <Collapse show={Boolean(state.message) && !state.success}>
            <p className="text-sm text-destructive mb-2">{state.message}</p>
          </Collapse>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
