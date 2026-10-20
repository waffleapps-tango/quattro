"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { TYPE_LABEL } from "@/domain/reports/labels";
import type { ParkingSpace, ReportType, StorageUnit } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean; fieldErrors?: Record<string, string> };

export function CreateReportForm({
  communityId,
  canFilePrivate,
  parkingSpaces,
  storageUnits,
}: {
  communityId: string;
  canFilePrivate: boolean;
  parkingSpaces: ParkingSpace[];
  storageUnits: StorageUnit[];
}) {
  const [open, setOpen] = useState(false);
  const [categoryKey, setCategoryKey] = useState("");
  const [type, setType] = useState<ReportType | "">("");
  const [title, setTitle] = useState("");
  const [parkingSpaceId, setParkingSpaceId] = useState("");
  const [storageUnitId, setStorageUnitId] = useState("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createReportAction,
    { message: "", success: false },
  );

  const categories = CATEGORIES.filter((c) => canFilePrivate || c.visibility === "PUBLIC");
  const category = getCategory(categoryKey);

  useEffect(() => {
    if (state.success && !pending) {
      setOpen(false);
      setCategoryKey("");
      setType("");
      setTitle("");
    }
  }, [state, pending]);

  useEffect(() => {
    // Auto-pick the only choice so a resident with one space isn't asked to choose.
    setType(category?.types.length === 1 ? category.types[0] : "");
    setParkingSpaceId(category?.subject === "parking" && parkingSpaces.length === 1 ? parkingSpaces[0].id : "");
    setStorageUnitId(category?.subject === "storage" && storageUnits.length === 1 ? storageUnits[0].id : "");
  }, [categoryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nowe zgłoszenie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowe zgłoszenie</DialogTitle>
          <DialogDescription>
            Wybierz kategorię i opisz sprawę. Zgłoszenia z kategorii „Moje…” widzisz tylko Ty i zarząd.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="categoryKey" value={categoryKey} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="parkingSpaceId" value={category?.subject === "parking" ? parkingSpaceId : ""} />
          <input type="hidden" name="storageUnitId" value={category?.subject === "storage" ? storageUnitId : ""} />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category">Kategoria</Label>
              <Select value={categoryKey} onValueChange={setCategoryKey}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Wybierz kategorię" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                      {c.visibility === "PRIVATE" ? " (prywatne)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.fieldErrors?.categoryKey && (
                <p className="text-sm text-destructive">Wybierz kategorię</p>
              )}
            </div>

            {category && category.types.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="type">Rodzaj</Label>
                <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Wybierz rodzaj" />
                  </SelectTrigger>
                  <SelectContent>
                    {category.types.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {state.fieldErrors?.type && (
                  <p className="text-sm text-destructive">Wybierz rodzaj</p>
                )}
              </div>
            )}

            {category?.subject === "parking" && (
              <div className="space-y-2">
                <Label htmlFor="parking">Miejsce parkingowe</Label>
                <Select value={parkingSpaceId} onValueChange={setParkingSpaceId}>
                  <SelectTrigger id="parking">
                    <SelectValue placeholder="Wybierz miejsce" />
                  </SelectTrigger>
                  <SelectContent>
                    {parkingSpaces.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.number}
                        {s.level ? ` (${s.level})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {parkingSpaces.length === 0 && (
                  <p className="text-sm text-destructive">
                    Nie masz przypisanego miejsca parkingowego. Skontaktuj się z administratorem.
                  </p>
                )}
              </div>
            )}

            {category?.subject === "storage" && (
              <div className="space-y-2">
                <Label htmlFor="storage">Komórka lokatorska</Label>
                <Select value={storageUnitId} onValueChange={setStorageUnitId}>
                  <SelectTrigger id="storage">
                    <SelectValue placeholder="Wybierz komórkę" />
                  </SelectTrigger>
                  <SelectContent>
                    {storageUnits.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {storageUnits.length === 0 && (
                  <p className="text-sm text-destructive">
                    Nie masz przypisanej komórki. Skontaktuj się z administratorem.
                  </p>
                )}
              </div>
            )}

            {category && (
              <div className="flex flex-wrap gap-1">
                {category.suggestions.map((s) => (
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
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Tytuł</Label>
              <Input
                id="title"
                name="title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
              {state.fieldErrors?.title && (
                <p className="text-sm text-destructive">Podaj tytuł</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Opis</Label>
              <Textarea id="description" name="description" maxLength={2000} rows={4} />
              {state.fieldErrors?.description && (
                <p className="text-sm text-destructive">Opisz sprawę</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="urgent" className="h-4 w-4" />
              Pilne (zalanie, awaria windy, zablokowana droga pożarowa)
            </label>
          </div>
          {state.message && !state.success && (
            <p className="text-sm text-destructive mb-2">{state.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Wysyłanie..." : "Wyślij"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
