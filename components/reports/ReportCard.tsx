"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { quick } from "@/lib/motion";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    <Card className="relative">
      {isUpdating && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-2">
          <span>{report.title}</span>
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={report.status}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={quick}
            >
              <Badge>{t(`status.${report.status}`)}</Badge>
            </m.span>
          </AnimatePresence>
        </CardTitle>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{t(`type.${report.type}`)}</Badge>
          <Badge variant="outline">{getCategory(report.category)
              ? t(`categories.${report.category}.label` as "categories.other.label")
              : report.category}</Badge>
          {report.visibility === "PRIVATE" && <Badge variant="secondary">{t("privateBadge")}</Badge>}
          {report.urgent && <Badge variant="destructive">{t("urgentBadge")}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm whitespace-pre-wrap">{report.description}</p>
        {place.length > 0 && (
          <p className="text-sm text-muted-foreground">{place.join(" / ")}</p>
        )}
        {showAuthor && (
          <p className="text-sm text-muted-foreground">
            {t("reportedBy", { name: report.author.firstName ?? report.author.email })}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {format.dateTime(new Date(report.createdAt), {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {actions.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "REJECTED" ? "outline" : "default"}
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
