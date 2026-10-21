"use client";

import { useActionState, useEffect, useState } from "react";
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
import { createMembershipAction } from "@/actions/memberships";
import { useTranslations } from "next-intl";
import { Role, type Building, type Apartment } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean };

export function CreateMembershipForm({
  communityId,
  buildings,
  apartmentsByBuilding,
}: {
  communityId: string;
  buildings: Building[];
  apartmentsByBuilding: Record<string, Apartment[]>;
}) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const [buildingId, setBuildingId] = useState<string>("");
  const [apartmentId, setApartmentId] = useState("");
  const [role, setRole] = useState<Role>(Role.RESIDENT);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createMembershipAction,
    { message: "", success: false },
  );

  useEffect(() => {
    if (state.success && !pending) setOpen(false);
  }, [state, pending]);

  useEffect(() => {
    setApartmentId("");
  }, [buildingId]);

  const apartments = buildingId ? apartmentsByBuilding[buildingId] ?? [] : [];

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
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">{t("roleLabel")}</Label>
              <Select name="role" value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Role.RESIDENT}>{t("role.RESIDENT")}</SelectItem>
                  <SelectItem value={Role.RECEPTIONIST}>{t("role.RECEPTIONIST")}</SelectItem>
                  <SelectItem value={Role.MANAGER}>{t("role.MANAGER")}</SelectItem>
                  <SelectItem value={Role.ADMIN}>{t("role.ADMIN")}</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="role" value={role} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buildingId">{t("building")}</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger id="buildingId">
                  <SelectValue placeholder={t("none")} />
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
                  <SelectValue placeholder={t("none")} />
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
