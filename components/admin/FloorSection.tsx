"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Collapse } from "@/components/motion/Collapse";
import { cn } from "@/lib/utils";
import { getFloorApartmentsAction } from "@/actions/apartments";
import type { OverviewApartment, OverviewFloor } from "@/domain/residencies/overview";
import { ApartmentRow } from "./ApartmentRow";
import { useFloorLabel } from "./useFloorLabel";

type Loaded = { onlyEmpty: boolean; apartments: OverviewApartment[] };

// Collapsed by default; the floor's apartments are fetched on first expand and refetched when
// the "only vacant" switch changes or someone is invited (loaded reset to null).
export function FloorSection({
  communityId,
  building,
  floor,
  onlyEmpty,
}: {
  communityId: string;
  building: { id: string; name: string };
  floor: OverviewFloor;
  onlyEmpty: boolean;
}) {
  const t = useTranslations("admin.apartments");
  const floorLabel = useFloorLabel();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || (loaded && loaded.onlyEmpty === onlyEmpty)) return;
    let cancelled = false;
    setFailed(false);
    getFloorApartmentsAction(communityId, building.id, floor.floor, onlyEmpty).then((res) => {
      if (cancelled) return;
      if (res.ok) setLoaded({ onlyEmpty, apartments: res.data });
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, onlyEmpty, loaded, communityId, building.id, floor.floor]);

  const ready = loaded && loaded.onlyEmpty === onlyEmpty;
  const regionId = `floor-${building.id}-${floor.floor ?? "none"}`;

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium">{floorLabel(floor.floor)}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("summary", { total: floor.total, empty: floor.vacant })}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <Collapse show={open}>
        <div id={regionId} className="divide-y border-t pl-4">
          {ready &&
            loaded.apartments.map((a) => (
              <ApartmentRow
                key={a.id}
                communityId={communityId}
                buildingName={building.name}
                apartment={a}
                onInvited={() => setLoaded(null)}
              />
            ))}
          {!ready && !failed && <p className="py-3 text-sm text-muted-foreground">{t("loading")}</p>}
          {failed && <p className="py-3 text-sm text-destructive">{t("loadFailed")}</p>}
        </div>
      </Collapse>
    </section>
  );
}
