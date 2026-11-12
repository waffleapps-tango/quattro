"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePackageParams } from "./use-package-params";

export function PackagesPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useTranslations("packages.pagination");
  const update = usePackageParams();
  if (total === 0) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const go = (p: number) => update({ page: p === 1 ? undefined : String(p) });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>{t("summary", { from, to, total })}</p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t("previous")}
          </Button>
          <span>{t("page", { page, count: pageCount })}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => go(page + 1)}>
            {t("next")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
