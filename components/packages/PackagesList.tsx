"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PackageCard } from "./PackageCard";
import { CreatePackageForm } from "./CreatePackageForm";
import { ReminderSettings } from "./ReminderSettings";
import { Package as PackageIcon } from "lucide-react";
import { EmptyState } from "@/components/system/EmptyState";
import { AnimatedList, AnimatedItem } from "@/components/motion/AnimatedList";
import { Input } from "@/components/ui/input";
import type { Package, Apartment, Building } from "@/lib/generated/prisma";

type PackageWithRelations = Package & {
  apartment: Apartment;
  building: Building;
  recipient: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email?: string;
  } | null;
};

export function PackagesList({
  packages,
  communityId,
  buildings,
  apartmentsByBuilding,
  isStaff,
  reminderAfterDays,
  canEditReminders,
}: {
  packages: PackageWithRelations[];
  communityId: string;
  buildings: Building[];
  apartmentsByBuilding: Record<string, Apartment[]>;
  isStaff: boolean;
  reminderAfterDays: number | null;
  canEditReminders: boolean;
}) {
  const t = useTranslations("packages");
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
          <h2 className="text-2xl font-semibold">{t("title")}</h2>
          <p className="text-muted-foreground">
            {isStaff ? t("subtitleStaff") : t("subtitleResident")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {isStaff && (
            <form onSubmit={handleSearchSubmit}>
              <Input
                placeholder={t("searchPlaceholder")}
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

      {isStaff && (
        <ReminderSettings
          communityId={communityId}
          reminderAfterDays={reminderAfterDays}
          canEdit={canEditReminders}
        />
      )}

      {packages.length === 0 ? (
        searchParams.get("q") ? (
          <EmptyState
            icon={PackageIcon}
            title={t("noResults")}
            description={t("noResultsHint")}
          />
        ) : (
          <EmptyState
            icon={PackageIcon}
            title={t("empty")}
            description={
              isStaff ? t("emptyStaff") : t("emptyResident")
            }
          />
        )
      ) : (
        <AnimatedList className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <AnimatedItem key={pkg.id} className="h-full [&>*]:h-full">
              <PackageCard pkg={pkg} canMarkPickedUp={isStaff} />
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}
    </div>
  );
}
