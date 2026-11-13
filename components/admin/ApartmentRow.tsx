"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { OverviewApartment } from "@/domain/residencies/overview";
import { InviteToApartmentDialog } from "./InviteToApartmentDialog";

export function ApartmentRow({
  communityId,
  buildingName,
  apartment: a,
  onInvited,
}: {
  communityId: string;
  buildingName: string;
  apartment: OverviewApartment;
  onInvited: () => void;
}) {
  const t = useTranslations("admin.apartments");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
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
      <InviteToApartmentDialog
        communityId={communityId}
        apartmentId={a.id}
        place={`${buildingName} / ${a.number}`}
        onInvited={onInvited}
      />
    </div>
  );
}
