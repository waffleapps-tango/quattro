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
import { createMembershipAction } from "@/actions/memberships";
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
          Dodaj członka
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj członka wspólnoty</DialogTitle>
          <DialogDescription>
            Ręczne przypisanie roli (bez zaproszenia e-mail/QR — etap kolejny).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="communityId" value={communityId} />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rola</Label>
              <Select name="role" value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Role.RESIDENT}>Resident</SelectItem>
                  <SelectItem value={Role.RECEPTIONIST}>Receptionist</SelectItem>
                  <SelectItem value={Role.MANAGER}>Manager</SelectItem>
                  <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="role" value={role} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buildingId">Budynek (opcjonalnie)</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger id="buildingId">
                  <SelectValue placeholder="Brak" />
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
              <Label htmlFor="apartmentId">Mieszkanie (opcjonalnie)</Label>
              <Select
                value={apartmentId}
                onValueChange={setApartmentId}
              >
                <SelectTrigger id="apartmentId">
                  <SelectValue placeholder="Brak" />
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
