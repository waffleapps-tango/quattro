"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { OverviewBuilding } from "@/domain/residencies/overview";
import { InviteToApartmentDialog } from "./InviteToApartmentDialog";

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
        const empty = b.apartments.filter((a) => a.residents.length === 0).length;
        const rows = onlyEmpty ? b.apartments.filter((a) => a.residents.length === 0) : b.apartments;
        return (
          <Card key={b.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{b.name}</CardTitle>
              <span className="text-sm text-muted-foreground">
                {t("summary", { total: b.apartments.length, empty })}
              </span>
            </CardHeader>
            <CardContent className="divide-y">
              {rows.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="w-16 font-medium">{a.number}</span>
                    {a.residents.length === 0 ? (
                      <Badge variant="outline">{t("vacant")}</Badge>
                    ) : (
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {a.residents.map((r) => (
                          <li key={r.id} className="flex items-center gap-2">
                            <span>{r.name}</span>
                            <Badge variant="secondary">{t(r.kind)}</Badge>
                            {r.pending && <Badge variant="outline">{t("pending")}</Badge>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <InviteToApartmentDialog communityId={communityId} apartmentId={a.id} place={`${b.name} / ${a.number}`} />
                </div>
              ))}
              {rows.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("noneEmpty")}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
