"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Bell, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { markPickedUpAction, remindPackageAction } from "@/actions/packages";
import type { Package, Apartment, Building } from "@/lib/generated/prisma";

export type PackageWithRelations = Package & {
  apartment: Apartment;
  building: Building;
  recipient: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email?: string;
  } | null;
};

const statusVariant = { RECEIVED: "warm", READY_FOR_PICKUP: "info", PICKED_UP: "secondary" } as const;

export function PackageRow({
  pkg,
  canMarkPickedUp,
}: {
  pkg: PackageWithRelations;
  canMarkPickedUp: boolean;
}) {
  const t = useTranslations("packages");
  const format = useFormatter();
  const [isUpdating, setIsUpdating] = useState(false);

  const run = async (action: (id: string) => Promise<{ success: boolean; message: string }>) => {
    setIsUpdating(true);
    try {
      const result = await action(pkg.id);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const daysWaiting = Math.floor(
    (Date.now() - new Date(pkg.receivedAt).getTime()) / (24 * 60 * 60 * 1000),
  );
  const picked = pkg.status === "PICKED_UP";
  const recipientName = pkg.recipient
    ? [pkg.recipient.firstName, pkg.recipient.lastName].filter(Boolean).join(" ") || pkg.recipient.email || ""
    : "";

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("copied"));
  };

  const received = format.dateTime(new Date(pkg.receivedAt), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <TableRow className={isUpdating ? "opacity-60" : undefined}>
      <TableCell className="py-4 align-top">
        <div className="flex items-center gap-1.5">
          {pkg.trackingNumber ? (
            <>
              <span className={`font-mono text-sm font-medium ${picked ? "line-through text-muted-foreground" : ""}`}>
                {pkg.trackingNumber}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("copied")}
                onClick={() => copyToClipboard(pkg.trackingNumber!)}
                className="h-6 w-6"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
        {pkg.courier && <p className="text-sm text-muted-foreground">{pkg.courier}</p>}
      </TableCell>
      <TableCell className="py-4 align-top">
        <p className="font-medium">
          {pkg.building.name} / {pkg.apartment.number}
        </p>
        {recipientName && <p className="text-sm text-muted-foreground">{recipientName}</p>}
        <p className="text-sm text-muted-foreground md:hidden">{received}</p>
      </TableCell>
      <TableCell className="hidden py-4 align-top md:table-cell">
        <p className="text-sm">{received}</p>
        {!picked && daysWaiting >= 1 && (
          <p className="text-sm font-medium text-warm-foreground" suppressHydrationWarning>
            {t("waitingDays", { count: daysWaiting })}
          </p>
        )}
      </TableCell>
      <TableCell className="py-4 align-top">
        <Badge variant={statusVariant[pkg.status]}>{t(`status.${pkg.status}`)}</Badge>
      </TableCell>
      <TableCell className="py-4 text-right align-top">
        {isUpdating ? (
          <Loader2 className="ml-auto h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          canMarkPickedUp &&
          !picked && (
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => run(markPickedUpAction)}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {t("pickUp")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => run(remindPackageAction)} aria-label={t("remind")}>
                <Bell className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{t("remind")}</span>
              </Button>
            </div>
          )
        )}
      </TableCell>
    </TableRow>
  );
}
