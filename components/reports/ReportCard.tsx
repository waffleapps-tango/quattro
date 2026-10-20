"use client";

import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changeReportStatusAction } from "@/actions/reports";
import { getCategory } from "@/domain/reports/catalog";
import { STATUS_LABEL, TYPE_LABEL } from "@/domain/reports/labels";
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
    report.apartment && `m. ${report.apartment.number}`,
    report.parkingSpace && `parking ${report.parkingSpace.number}`,
    report.storageUnit && `komórka ${report.storageUnit.number}`,
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
          <Badge>{STATUS_LABEL[report.status]}</Badge>
        </CardTitle>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{TYPE_LABEL[report.type]}</Badge>
          <Badge variant="outline">{getCategory(report.category)?.label ?? report.category}</Badge>
          {report.visibility === "PRIVATE" && <Badge variant="secondary">Prywatne</Badge>}
          {report.urgent && <Badge variant="destructive">Pilne</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm whitespace-pre-wrap">{report.description}</p>
        {place.length > 0 && (
          <p className="text-sm text-muted-foreground">{place.join(" / ")}</p>
        )}
        {showAuthor && (
          <p className="text-sm text-muted-foreground">
            Zgłosił: {report.author.firstName ?? report.author.email}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {format(new Date(report.createdAt), "dd.MM.yyyy HH:mm")}
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
                {STATUS_LABEL[status]}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
