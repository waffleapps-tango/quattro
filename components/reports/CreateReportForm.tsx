"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createReportAction } from "@/actions/reports";
import { CATEGORIES, getCategory } from "@/domain/reports/catalog";
import type { ParkingSpace, ReportType, StorageUnit } from "@/lib/generated/prisma";

// Category keys are dynamic (validated by i18n/catalog-messages.test.ts); one literal stands in for the typed key.
type CatLabelKey = "categories.other.label";
type CatSuggKey = "categories.other.suggestions";

type ActionState = { message: string; success: boolean; fieldErrors?: Record<string, string> };

export function CreateReportForm({
  communityId,
  canFilePrivate,
  apartments,
  parkingSpaces,
  storageUnits,
}: {
  communityId: string;
  canFilePrivate: boolean;
  apartments: { id: string; label: string }[];
  parkingSpaces: ParkingSpace[];
  storageUnits: StorageUnit[];
}) {
  const t = useTranslations("reports");
  const [open, setOpen] = useState(false);
  const [categoryKey, setCategoryKey] = useState("");
  const [type, setType] = useState<ReportType | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [apartmentId, setApartmentId] = useState(apartments.length === 1 ? apartments[0].id : "");
  const [parkingSpaceId, setParkingSpaceId] = useState("");
  const [storageUnitId, setStorageUnitId] = useState("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createReportAction,
    { message: "", success: false },
  );

  const categories = CATEGORIES.filter((c) => canFilePrivate || c.visibility === "PUBLIC");
  const category = getCategory(categoryKey);
  const visibleParking =
    apartments.length > 1 && apartmentId
      ? parkingSpaces.filter((s) => s.apartmentId === apartmentId)
      : parkingSpaces;
  const visibleStorage =
    apartments.length > 1 && apartmentId
      ? storageUnits.filter((u) => u.apartmentId === apartmentId)
      : storageUnits;

  useEffect(() => {
    if (state.success && !pending) {
      setOpen(false);
      setCategoryKey("");
      setType("");
      setTitle("");
      setDescription("");
      setUrgent(false);
    }
  }, [state, pending]);

  useEffect(() => {
    // Auto-pick the only choice so a resident with one space isn't asked to choose.
    setType(category?.types.length === 1 ? category.types[0] : "");
    setParkingSpaceId(category?.subject === "parking" && visibleParking.length === 1 ? visibleParking[0].id : "");
    setStorageUnitId(category?.subject === "storage" && visibleStorage.length === 1 ? visibleStorage[0].id : "");
  }, [categoryKey, apartmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="categoryKey" value={categoryKey} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="apartmentId" value={apartmentId} />
          <input type="hidden" name="parkingSpaceId" value={category?.subject === "parking" ? parkingSpaceId : ""} />
          <input type="hidden" name="storageUnitId" value={category?.subject === "storage" ? storageUnitId : ""} />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category">{t("category")}</Label>
              <Select value={categoryKey} onValueChange={setCategoryKey}>
                <SelectTrigger id="category">
                  <SelectValue placeholder={t("categoryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.visibility === "PRIVATE"
                        ? t("privateSuffix", { label: t(`categories.${c.key}.label` as CatLabelKey) })
                        : t(`categories.${c.key}.label` as CatLabelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Collapse show={Boolean(state.fieldErrors?.categoryKey)}>
                <p className="text-sm text-destructive">{t("categoryRequired")}</p>
              </Collapse>
            </div>

            <Collapse show={Boolean(category && category.types.length > 1)} className="-mx-1 -mt-1 mb-0!">
              <div className="space-y-2 px-1 pt-1 pb-4">
                <Label htmlFor="type">{t("kind")}</Label>
                <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder={t("kindPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {category?.types.map((ty) => (
                      <SelectItem key={ty} value={ty}>
                        {t(`type.${ty}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Collapse show={Boolean(state.fieldErrors?.type)}>
                  <p className="text-sm text-destructive">{t("kindRequired")}</p>
                </Collapse>
              </div>
            </Collapse>

            <Collapse show={apartments.length > 1 && Boolean(category)} className="-mx-1 -mt-1 mb-0!">
              <div className="space-y-2 px-1 pt-1 pb-4">
                <Label htmlFor="apartment">{t("apartment")}</Label>
                <Select value={apartmentId} onValueChange={setApartmentId}>
                  <SelectTrigger id="apartment">
                    <SelectValue placeholder={t("apartmentPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {apartments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Collapse>

            <Collapse show={category?.subject === "parking"} className="-mx-1 -mt-1 mb-0!">
              <div className="space-y-2 px-1 pt-1 pb-4">
                <Label htmlFor="parking">{t("parking")}</Label>
                <Select value={parkingSpaceId} onValueChange={setParkingSpaceId}>
                  <SelectTrigger id="parking">
                    <SelectValue placeholder={t("parkingPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleParking.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.level ? t("parkingLevel", { number: s.number, level: s.level }) : s.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {visibleParking.length === 0 && (
                  <p className="text-sm text-destructive">
                    {t("noParking")}
                  </p>
                )}
              </div>
            </Collapse>

            <Collapse show={category?.subject === "storage"} className="-mx-1 -mt-1 mb-0!">
              <div className="space-y-2 px-1 pt-1 pb-4">
                <Label htmlFor="storage">{t("storage")}</Label>
                <Select value={storageUnitId} onValueChange={setStorageUnitId}>
                  <SelectTrigger id="storage">
                    <SelectValue placeholder={t("storagePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleStorage.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {visibleStorage.length === 0 && (
                  <p className="text-sm text-destructive">
                    {t("noStorage")}
                  </p>
                )}
              </div>
            </Collapse>

            <Collapse show={Boolean(category)} className="-mx-1 -mt-1 mb-0!">
              <div className="flex flex-wrap gap-1 px-1 pt-1 pb-4">
                {category && (t.raw(`categories.${category.key}.suggestions` as CatSuggKey) as string[]).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal py-1 text-left"
                    onClick={() => setTitle(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </Collapse>

            <div className="space-y-2">
              <Label htmlFor="title">{t("titleLabel")}</Label>
              <Input
                id="title"
                name="title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Collapse show={Boolean(state.fieldErrors?.title)}>
                <p className="text-sm text-destructive">{t("titleRequired")}</p>
              </Collapse>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t("description")}</Label>
              <Textarea
                id="description"
                name="description"
                value={description}
                maxLength={2000}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
              />
              <Collapse show={Boolean(state.fieldErrors?.description)}>
                <p className="text-sm text-destructive">{t("descriptionRequired")}</p>
              </Collapse>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="urgent"
                className="h-4 w-4"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
              />
              {t("urgent")}
            </label>
          </div>
          <Collapse show={Boolean(state.message) && !state.success}>
            <p className="text-sm text-destructive mb-2">{state.message}</p>
          </Collapse>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("sending") : t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
