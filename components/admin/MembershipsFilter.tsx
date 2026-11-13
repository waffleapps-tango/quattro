"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBuildingApartmentsAction } from "@/actions/apartments";
import type { ApartmentOption } from "@/domain/residencies/overview";
import { useFloorLabel } from "./useFloorLabel";

const ALL = "all";

// Filter state lives in the URL (building, apartment, q) so the server page filters and links are shareable.
export function MembershipsFilter({
  communityId,
  buildings,
  buildingId,
  apartmentId,
  q,
}: {
  communityId: string;
  buildings: { id: string; name: string }[];
  buildingId?: string;
  apartmentId?: string;
  q?: string;
}) {
  const t = useTranslations("admin");
  const floorLabel = useFloorLabel();
  const router = useRouter();
  const pathname = usePathname();
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [query, setQuery] = useState(q ?? "");

  useEffect(() => {
    setApartments([]);
    if (!buildingId) return;
    let cancelled = false;
    getBuildingApartmentsAction(communityId, buildingId).then((res) => {
      if (!cancelled && res.ok) setApartments(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [communityId, buildingId]);

  const go = (next: { building?: string; apartment?: string; q?: string }) => {
    const values = { building: buildingId, apartment: apartmentId, q, ...next };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const active = Boolean(buildingId || apartmentId || q);

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <Select
        value={buildingId ?? ALL}
        onValueChange={(v) => go({ building: v === ALL ? "" : v, apartment: "" })}
      >
        <SelectTrigger className="w-[200px]" aria-label={t("filterBuilding")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allBuildings")}</SelectItem>
          {buildings.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={apartmentId ?? ALL}
        disabled={!buildingId}
        onValueChange={(v) => go({ apartment: v === ALL ? "" : v })}
      >
        <SelectTrigger className="w-[200px]" aria-label={t("filterApartment")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allApartments")}</SelectItem>
          {apartments.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.number}
              {a.floor !== null && ` · ${floorLabel(a.floor)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: query.trim() });
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          maxLength={100}
          className="w-[220px]"
        />
        <Button type="submit" variant="outline" size="icon" aria-label={t("searchLabel")}>
          <Search className="h-4 w-4" />
        </Button>
      </form>
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            router.replace(pathname);
          }}
        >
          <X className="mr-1 h-4 w-4" />
          {t("clearFilters")}
        </Button>
      )}
    </div>
  );
}
