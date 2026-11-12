"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ReportCard } from "./ReportCard";
import { CreateReportForm } from "./CreateReportForm";
import { EmptyState } from "@/components/system/EmptyState";
import { AnimatedList, AnimatedItem } from "@/components/motion/AnimatedList";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES } from "@/domain/reports/catalog";
import type { ReportListItem } from "@/domain/reports";
import type { ReportStatus, ParkingSpace, StorageUnit } from "@/lib/generated/prisma";

const ALL = "all";
const STATUSES: ReportStatus[] = ["NEW", "IN_PROGRESS", "RESOLVED", "APPROVED", "REJECTED", "CLOSED"];

export function ReportsList({
  reports,
  communityId,
  isStaff,
  canApprove,
  canFilePrivate,
  apartments,
  parkingSpaces,
  storageUnits,
}: {
  reports: ReportListItem[];
  communityId: string;
  isStaff: boolean;
  canApprove: boolean;
  canFilePrivate: boolean;
  apartments: { id: string; label: string }[];
  parkingSpaces: ParkingSpace[];
  storageUnits: StorageUnit[];
}) {
  const t = useTranslations("reports");
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "mine" ? "mine" : "board";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    router.push(`/reports?${params.toString()}`);
  };

  const filterSelect = (
    key: string,
    placeholder: string,
    options: { value: string; label: string }[],
  ) => (
    <Select value={searchParams.get(key) ?? ALL} onValueChange={(v) => setParam(key, v)}>
      <SelectTrigger className="w-full bg-muted sm:w-48">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-muted-foreground">
          {isStaff ? t("subtitleStaff") : t("subtitleResident")}
        </p>
        <CreateReportForm
          communityId={communityId}
          canFilePrivate={canFilePrivate}
          apartments={apartments}
          parkingSpaces={parkingSpaces}
          storageUnits={storageUnits}
        />
      </div>

      {isStaff ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {filterSelect("visibility", t("filterVisibility"), [
            { value: "PUBLIC", label: t("filterPublic") },
            { value: "PRIVATE", label: t("filterPrivate") },
          ])}
          {filterSelect(
            "status",
            t("filterStatus"),
            STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
          )}
          {filterSelect(
            "category",
            t("filterCategory"),
            CATEGORIES.map((c) => ({
              value: c.key,
              label: t(`categories.${c.key}.label` as "categories.other.label"),
            })),
          )}
          {filterSelect("urgent", t("filterUrgent"), [{ value: "1", label: t("filterUrgentOnly") }])}
        </div>
      ) : (
        <div className="inline-flex w-fit gap-1 rounded-xl bg-muted p-1">
          <Button asChild variant={view === "board" ? "default" : "ghost"} size="sm">
            <Link href="/reports?view=board">{t("viewBoard")}</Link>
          </Button>
          <Button asChild variant={view === "mine" ? "default" : "ghost"} size="sm">
            <Link href="/reports?view=mine">{t("viewMine")}</Link>
          </Button>
        </div>
      )}

      {reports.length === 0 ? (
        <EmptyState
          illustration={
            ["visibility", "status", "category", "urgent"].some((k) => searchParams.has(k))
              ? "search-empty"
              : "maintenance"
          }
          title={t("empty")}
          description={
            isStaff
              ? t("emptyStaff")
              : view === "mine"
                ? t("emptyMine")
                : t("emptyBoard")
          }
        />
      ) : (
        <AnimatedList className="grid gap-4">
          {reports.map((report) => (
            <AnimatedItem key={report.id}>
              <ReportCard
                report={report}
                canChangeStatus={isStaff}
                canApprove={canApprove}
                showAuthor={isStaff}
              />
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}
    </div>
  );
}
