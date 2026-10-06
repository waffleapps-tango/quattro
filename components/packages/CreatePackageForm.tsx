"use client";

import { useActionState, useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { createPackageAction } from "@/actions/packages";
import type { Building, Apartment } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean };

export function CreatePackageForm({
  communityId,
  buildings,
  apartmentsByBuilding,
}: {
  communityId: string;
  buildings: Building[];
  apartmentsByBuilding: Record<string, Apartment[]>;
}) {
  const [open, setOpen] = useState(false);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPackageAction,
    { message: "", success: false },
  );

  useEffect(() => {
    if (state.success && !pending) setOpen(false);
  }, [state, pending]);

  const apartments = apartmentsByBuilding[buildingId] ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj paczkę
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zarejestruj paczkę</DialogTitle>
          <DialogDescription>
            Wybierz mieszkanie i wpisz dane paczki.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="communityId" value={communityId} />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="buildingId">Budynek</Label>
              <Select
                name="buildingId"
                value={buildingId}
                onValueChange={setBuildingId}
              >
                <SelectTrigger id="buildingId">
                  <SelectValue placeholder="Wybierz budynek" />
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
              <Label htmlFor="apartmentId">Mieszkanie</Label>
              <Select name="apartmentId">
                <SelectTrigger id="apartmentId">
                  <SelectValue placeholder="Wybierz mieszkanie" />
                </SelectTrigger>
                <SelectContent>
                  {apartments.map((apartment) => (
                    <SelectItem key={apartment.id} value={apartment.id}>
                      {apartment.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trackingNumber">Numer przesyłki</Label>
              <Input id="trackingNumber" name="trackingNumber" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="courier">Kurier</Label>
              <Input id="courier" name="courier" />
            </div>
          </div>
          {state.message && !state.success && (
            <p className="text-sm text-destructive mb-2">{state.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
