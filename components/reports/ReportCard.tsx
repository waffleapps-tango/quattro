"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { quick } from "@/lib/motion";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarDays, Loader2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/components/reports/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="relative gap-6">
      {isUpdating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/50">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
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
        <CardTitle className="font-heading text-2xl leading-tight sm:text-3xl">{report.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <time dateTime={new Date(report.createdAt).toISOString()} className="tabular-nums">
              {format.dateTime(new Date(report.createdAt), { dateStyle: "long" })}
            </time>
          </span>
          {place.length > 0 && (
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{place.join(" / ")}</span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-6">
        <p className="line-clamp-6 whitespace-pre-line text-base leading-relaxed">{report.description}</p>
        {showAuthor && (
          <p className="text-sm text-muted-foreground">
            {t("reportedBy", {
              name:
                [report.author.firstName, report.author.lastName].filter(Boolean).join(" ") || report.author.email,
            })}
          </p>
        )}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
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
      </CardContent>
    </Card>
  );
}
