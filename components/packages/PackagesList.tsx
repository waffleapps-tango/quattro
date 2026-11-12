"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { PackageRow, type PackageWithRelations } from "./PackageRow";
import { PackagesPagination } from "./PackagesPagination";
import { PackagesToolbar } from "./PackagesToolbar";
import { usePackageParams } from "./use-package-params";
import { EmptyState } from "@/components/system/EmptyState";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Building } from "@/lib/generated/prisma";
import type { PackageQuery, PackageSort } from "@/domain/packages/query";

function SortHead({
  label,
  sortKey,
  query,
  className,
}: {
  label: string;
  sortKey: PackageSort;
  query: PackageQuery;
  className?: string;
}) {
  const update = usePackageParams();
  const active = query.sort === sortKey;
  // A new column starts ascending (received starts newest-first); the active one toggles.
  const nextDir = active ? (query.dir === "asc" ? "desc" : "asc") : sortKey === "received" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : query.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase tracking-[0.08em] hover:text-foreground"
        onClick={() =>
          update({
            sort: sortKey === "received" ? undefined : sortKey,
            dir: nextDir === "desc" ? undefined : nextDir,
          })
        }
      >
        {label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

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
        <>
          <Card className="gap-0 overflow-hidden py-0">
            <Table className="max-md:block max-md:[&_tbody]:block max-md:[&_thead]:hidden">
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted [&>th]:h-11 [&>th]:text-[11px] [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-[0.08em]">
                  <TableHead>{t("col.package")}</TableHead>
                  <SortHead label={t("col.location")} sortKey="apartment" query={query} />
                  <SortHead label={t("col.received")} sortKey="received" query={query} className="hidden md:table-cell" />
                  <SortHead label={t("col.status")} sortKey="status" query={query} />
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
          <PackagesPagination page={page} pageSize={pageSize} total={total} />
        </>
      )}
    </div>
  );
}
