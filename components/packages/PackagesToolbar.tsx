"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PackageQuery } from "@/domain/packages/query";
import type { Building } from "@/lib/generated/prisma";
import { usePackageParams } from "./use-package-params";

const SORT_OPTIONS = ["received:desc", "received:asc", "apartment:asc", "apartment:desc", "status:asc", "status:desc"] as const;

export function PackagesToolbar({
  query,
  isStaff,
  buildings,
}: {
  query: PackageQuery;
  isStaff: boolean;
  buildings: Pick<Building, "id" | "name">[];
}) {
  const t = useTranslations("packages");
  const update = usePackageParams();
  const filtersActive = Boolean(query.q || (isStaff && (query.building || query.apartment || query.recipient)));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    update({
      q: String(data.get("q") ?? "").trim() || undefined,
      apartment: String(data.get("apartment") ?? "").trim() || undefined,
      recipient: String(data.get("recipient") ?? "").trim() || undefined,
    });
  };

  return (
    <div className="space-y-3">
      <form
        // Remount when the URL changes the text values (e.g. "clear filters").
        key={`${query.q}|${query.apartment}|${query.recipient}`}
        onSubmit={submit}
        className="flex flex-col gap-3"
      >
        {isStaff && (
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                aria-label={t("searchPlaceholder")}
                defaultValue={query.q}
                placeholder={t("searchPlaceholder")}
                className="bg-muted pl-9"
              />
            </div>
            <Select
              value={query.building || "all"}
              onValueChange={(v) => update({ building: v === "all" ? undefined : v })}
            >
              <SelectTrigger aria-label={t("filters.building")} className="lg:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allBuildings")}</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              name="apartment"
              defaultValue={query.apartment}
              placeholder={t("filters.apartment")}
              aria-label={t("filters.apartment")}
              className="lg:w-36"
            />
            <Input
              name="recipient"
              defaultValue={query.recipient}
              placeholder={t("filters.recipient")}
              aria-label={t("filters.recipient")}
              className="lg:w-64"
            />
            <Button type="submit">{t("filters.search")}</Button>
          </div>
        )}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="packages-open-only"
            checked={query.status === "open"}
            onCheckedChange={(on) => update({ status: on ? undefined : "all" })}
          />
          <Label htmlFor="packages-open-only">{t("filters.openOnly")}</Label>
        </div>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update({ q: undefined, building: undefined, apartment: undefined, recipient: undefined })}
            >
              {t("filters.reset")}
            </Button>
          )}
          {/* Phones have no table header to click, so sorting is a select there. */}
          <Select
            value={`${query.sort}:${query.dir}`}
            onValueChange={(v) => {
              const [sort, dir] = v.split(":");
              update({ sort: sort === "received" ? undefined : sort, dir: dir === "desc" ? undefined : dir });
            }}
          >
            <SelectTrigger aria-label={t("filters.sort")} className="w-44 md:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {t(`sortOptions.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
