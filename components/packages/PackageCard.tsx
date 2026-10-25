"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, Loader2, Copy } from "lucide-react";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { quick } from "@/lib/motion";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { markPickedUpAction, remindPackageAction } from "@/actions/packages";
import type { Package, Apartment, Building } from "@/lib/generated/prisma";

type PackageWithRelations = Package & {
  apartment: Apartment;
  building: Building;
  recipient: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email?: string;
  } | null;
};

export function PackageCard({
  pkg,
  canMarkPickedUp,
}: {
  pkg: PackageWithRelations;
  canMarkPickedUp: boolean;
}) {
  const t = useTranslations("packages");
  const format = useFormatter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handlePickup = async () => {
    setIsUpdating(true);
    try {
      const result = await markPickedUpAction(pkg.id);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemind = async () => {
    setIsUpdating(true);
    try {
      const result = await remindPackageAction(pkg.id);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const daysWaiting = Math.floor(
    (Date.now() - new Date(pkg.receivedAt).getTime()) / (24 * 60 * 60 * 1000),
  );

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("copied"));
  };

  return (
    <Card className="relative">
      {isUpdating && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>
            {pkg.building.name} / {pkg.apartment.number}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={pkg.status}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={quick}
            >
              <Badge>{t(`status.${pkg.status}`)}</Badge>
            </m.span>
          </AnimatePresence>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {pkg.trackingNumber && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("numberLabel", { value: pkg.trackingNumber })}
              </p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(pkg.trackingNumber!)}
                className="h-6 w-6"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          {pkg.courier && (
            <p className="text-sm text-muted-foreground">{t("courierLabel", { value: pkg.courier })}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {t("receivedAt", {
              date: format.dateTime(new Date(pkg.receivedAt), {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </p>
          {pkg.status !== "PICKED_UP" && daysWaiting >= 1 && (
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              {t("waitingDays", { count: daysWaiting })}
            </p>
          )}
          {pkg.recipient && (
            <p className="text-sm text-muted-foreground">
              {t("recipientLabel", {
                value:
                  [pkg.recipient.firstName, pkg.recipient.lastName].filter(Boolean).join(" ") ||
                  pkg.recipient.email ||
                  "",
              })}
            </p>
          )}
          {canMarkPickedUp && pkg.status !== "PICKED_UP" && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={handlePickup} disabled={isUpdating}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isUpdating ? t("saving") : t("pickUp")}
              </Button>
              <Button size="sm" variant="outline" onClick={handleRemind} disabled={isUpdating}>
                <Bell className="mr-2 h-4 w-4" />
                {t("remind")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
