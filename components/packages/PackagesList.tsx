"use client";

import { useTranslations } from "next-intl";
import { PackageRow, type PackageWithRelations } from "./PackageRow";
import { PackagesToolbar } from "./PackagesToolbar";
import { EmptyState } from "@/components/system/EmptyState";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Building } from "@/lib/generated/prisma";
import type { PackageQuery } from "@/domain/packages/query";

export function PackagesList({
  packages,
  total,
  page,
  pageSize,
  query,
  buildings,
  isStaff,
}: {
  packages: PackageWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  query: PackageQuery;
  buildings: Pick<Building, "id" | "name">[];
  isStaff: boolean;
}) {
  const t = useTranslations("packages");

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {isStaff ? t("subtitleStaff") : t("subtitleResident")}
      </p>
      <PackagesToolbar query={query} isStaff={isStaff} buildings={buildings} />

      {packages.length === 0 ? (
        query.q || query.building || query.apartment || query.recipient ? (
          <EmptyState illustration="search-empty" title={t("noResults")} description={t("noResultsHint")} />
        ) : query.status === "open" ? (
          <EmptyState illustration="all-clear" title={t("noOpen")} description={t("noOpenHint")} />
        ) : (
          <EmptyState
            illustration="locker"
            title={t("empty")}
            description={isStaff ? t("emptyStaff") : t("emptyResident")}
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
