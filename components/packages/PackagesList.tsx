"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PackageRow, type PackageWithRelations } from "./PackageRow";
import { CreatePackageForm } from "./CreatePackageForm";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/system/EmptyState";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { Apartment, Building } from "@/lib/generated/prisma";

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
        <p className="text-muted-foreground">
          {isStaff ? t("subtitleStaff") : t("subtitleResident")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {isStaff && (
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="w-full bg-muted pl-9 sm:w-80"
                />
              </div>
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
            illustration="search-empty"
            title={t("noResults")}
            description={t("noResultsHint")}
          />
        ) : (
          <EmptyState
            illustration="locker"
            title={t("empty")}
            description={
              isStaff ? t("emptyStaff") : t("emptyResident")
            }
          />
        )
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table className="max-md:block max-md:[&_tbody]:block max-md:[&_thead]:hidden">
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted [&>th]:h-11 [&>th]:text-[11px] [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-[0.08em]">
                <TableHead>{t("col.package")}</TableHead>
                <TableHead>{t("col.location")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("col.received")}</TableHead>
                <TableHead>{t("col.status")}</TableHead>
                <TableHead className="text-right">{isStaff ? t("col.actions") : null}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <PackageRow key={pkg.id} pkg={pkg} canMarkPickedUp={isStaff} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
