"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportCard } from "./ReportCard";
import { CreateReportForm } from "./CreateReportForm";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES } from "@/domain/reports/catalog";
import { STATUS_LABEL } from "@/domain/reports/labels";
import type { ReportListItem } from "@/domain/reports";
import type { ParkingSpace, StorageUnit } from "@/lib/generated/prisma";

const ALL = "all";

export function ReportsList({
  reports,
  communityId,
  isStaff,
  canApprove,
  canFilePrivate,
  parkingSpaces,
  storageUnits,
}: {
  reports: ReportListItem[];
  communityId: string;
  isStaff: boolean;
  canApprove: boolean;
  canFilePrivate: boolean;
  parkingSpaces: ParkingSpace[];
  storageUnits: StorageUnit[];
}) {
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
      <SelectTrigger className="w-full sm:w-48">
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
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">Zgłoszenia</h2>
          <p className="text-muted-foreground">
            {isStaff ? "Wszystkie zgłoszenia wspólnoty." : "Zgłaszaj usterki, pytania i pomysły."}
          </p>
        </div>
        <CreateReportForm
          communityId={communityId}
          canFilePrivate={canFilePrivate}
          parkingSpaces={parkingSpaces}
          storageUnits={storageUnits}
        />
      </div>

      {isStaff ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {filterSelect("visibility", "Wszystkie", [
            { value: "PUBLIC", label: "Publiczne" },
            { value: "PRIVATE", label: "Prywatne" },
          ])}
          {filterSelect(
            "status",
            "Dowolny status",
            Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
          )}
          {filterSelect(
            "category",
            "Dowolna kategoria",
            CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
          )}
          {filterSelect("urgent", "Pilne i inne", [{ value: "1", label: "Tylko pilne" }])}
        </div>
      ) : (
        <div className="flex gap-2">
          <Button asChild variant={view === "board" ? "default" : "outline"} size="sm">
            <Link href="/reports?view=board">Tablica osiedla</Link>
          </Button>
          <Button asChild variant={view === "mine" ? "default" : "outline"} size="sm">
            <Link href="/reports?view=mine">Moje zgłoszenia</Link>
          </Button>
        </div>
      )}

      {reports.length === 0 ? (
        <p className="text-muted-foreground">Brak zgłoszeń.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              canChangeStatus={isStaff}
              canApprove={canApprove}
              showAuthor={isStaff}
            />
          ))}
        </div>
      )}
    </div>
  );
}
