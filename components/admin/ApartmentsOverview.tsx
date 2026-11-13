"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { OverviewBuilding } from "@/domain/residencies/overview";
import { FloorSection } from "./FloorSection";

export function ApartmentsOverview({ communityId, buildings }: { communityId: string; buildings: OverviewBuilding[] }) {
  const t = useTranslations("admin.apartments");
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch id="only-empty" checked={onlyEmpty} onCheckedChange={setOnlyEmpty} />
        <Label htmlFor="only-empty">{t("onlyEmpty")}</Label>
      </div>
      {buildings.length === 0 && <p className="text-sm text-muted-foreground">{t("noBuildings")}</p>}
      {buildings.map((b) => {
        const total = b.floors.reduce((sum, f) => sum + f.total, 0);
        const empty = b.floors.reduce((sum, f) => sum + f.vacant, 0);
        const floors = onlyEmpty ? b.floors.filter((f) => f.vacant > 0) : b.floors;
        return (
          <Card key={b.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{b.name}</CardTitle>
              <span className="text-sm text-muted-foreground">{t("summary", { total, empty })}</span>
            </CardHeader>
            <CardContent className="divide-y">
              {floors.map((f) => (
                <FloorSection
                  key={f.floor ?? "none"}
                  communityId={communityId}
                  building={{ id: b.id, name: b.name }}
                  floor={f}
                  onlyEmpty={onlyEmpty}
                />
              ))}
              {floors.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("noneEmpty")}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
