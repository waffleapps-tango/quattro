"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { quick } from "@/lib/motion";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/components/reports/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { changeReportStatusAction } from "@/actions/reports";
import { getCategory } from "@/domain/reports/catalog";
import { nextStatuses } from "@/domain/reports/transitions";
import type { ReportListItem } from "@/domain/reports";
import type { ReportStatus } from "@/lib/generated/prisma";

export function ReportCard({
  report,
  canChangeStatus,
  canApprove,
  showAuthor,
}: {
  report: ReportListItem;
  canChangeStatus: boolean;
  canApprove: boolean;
  showAuthor: boolean;
}) {
  const t = useTranslations("reports");
  const format = useFormatter();
  const [isUpdating, setIsUpdating] = useState(false);

  const actions = canChangeStatus
    ? nextStatuses(report.type, report.status).filter(
        (s) => canApprove || (s !== "APPROVED" && s !== "REJECTED"),
      )
    : [];

  const handleChange = async (status: ReportStatus) => {
    setIsUpdating(true);
    try {
      const result = await changeReportStatusAction(report.id, status);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const place = [
    report.building?.name,
    report.apartment && t("placeApartment", { number: report.apartment.number }),
    report.parkingSpace && t("placeParking", { number: report.parkingSpace.number }),
    report.storageUnit && t("placeStorage", { number: report.storageUnit.number }),
  ].filter(Boolean);

  return (
    <Card className="relative gap-4">
      {isUpdating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/50">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 px-6">
        {report.urgent && <Badge variant="danger">{t("urgentBadge")}</Badge>}
        <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-secondary-foreground">
          {t(`type.${report.type}`)}
        </span>
        <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {getCategory(report.category)
            ? t(`categories.${report.category}.label` as "categories.other.label")
            : report.category}
        </span>
        {report.visibility === "PRIVATE" && <Badge variant="outline">{t("privateBadge")}</Badge>}
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={report.status}
            className="ml-auto"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={quick}
          >
            <Badge variant={statusVariant(report.status)}>{t(`status.${report.status}`)}</Badge>
          </m.span>
        </AnimatePresence>
      </div>
      <div className="space-y-2 px-6">
        <h3 className="font-heading text-lg font-semibold leading-snug">{report.title}</h3>
        <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{report.description}</p>
        {showAuthor && (
          <p className="text-sm text-muted-foreground">
            {t("reportedBy", { name: report.author.firstName ?? report.author.email })}
          </p>
        )}
      </div>
      <div className="mx-6 mt-auto flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">{place.join(" / ")}</span>
        <time className="shrink-0">
          {format.dateTime(new Date(report.createdAt), {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 px-6">
          {actions.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={status === "REJECTED" ? "secondary" : "default"}
              disabled={isUpdating}
              onClick={() => handleChange(status)}
            >
              {t(`status.${status}`)}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
