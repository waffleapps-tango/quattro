"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PackageCard } from "./PackageCard";
import { CreatePackageForm } from "./CreatePackageForm";
import { Package as PackageIcon } from "lucide-react";
import { EmptyState } from "@/components/system/EmptyState";
import { Input } from "@/components/ui/input";
import type { Package, Apartment, Building, User } from "@/lib/generated/prisma";

type PackageWithRelations = Package & {
  apartment: Apartment;
  building: Building;
  recipient: User | null;
};

export function PackagesList({
  packages,
  communityId,
  buildings,
  apartmentsByBuilding,
  isStaff,
}: {
  packages: PackageWithRelations[];
  communityId: string;
  buildings: Building[];
  apartmentsByBuilding: Record<string, Apartment[]>;
  isStaff: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("q", searchValue);
    } else {
      params.delete("q");
    }
    router.push(`/packages?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">Paczki</h2>
          <p className="text-muted-foreground">
            {isStaff ? "Zarządzaj paczkami w recepcji." : "Twoje paczki."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {isStaff && (
            <form onSubmit={handleSearchSubmit}>
              <Input
                placeholder="Szukaj (numer, mieszkanie, email)..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="max-w-sm"
              />
            </form>
          )}
          {isStaff && (
            <CreatePackageForm
              communityId={communityId}
              buildings={buildings}
              apartmentsByBuilding={apartmentsByBuilding}
            />
          )}
        </div>
      </div>

      {packages.length === 0 ? (
        searchParams.get("q") ? (
          <EmptyState
            icon={PackageIcon}
            title="Nic nie znaleziono"
            description="Zmień frazę wyszukiwania."
          />
        ) : (
          <EmptyState
            icon={PackageIcon}
            title="Brak paczek"
            description={
              isStaff
                ? "Zarejestruj pierwszą paczkę przyciskiem „Dodaj paczkę”."
                : "Gdy przyjdzie paczka, zobaczysz ją tutaj."
            }
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} canMarkPickedUp={isStaff} />
          ))}
        </div>
      )}
    </div>
  );
}
