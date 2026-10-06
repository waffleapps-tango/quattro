"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { markPickedUpAction } from "@/actions/packages";
import type { Package, Apartment, Building, User } from "@/lib/generated/prisma";

type PackageWithRelations = Package & {
  apartment: Apartment;
  building: Building;
  recipient: User | null;
};

const STATUS_LABEL: Record<Package["status"], string> = {
  RECEIVED: "Przyjęta",
  READY_FOR_PICKUP: "Do odbioru",
  PICKED_UP: "Odebrana",
};

export function PackageCard({
  pkg,
  canMarkPickedUp,
}: {
  pkg: PackageWithRelations;
  canMarkPickedUp: boolean;
}) {
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

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Skopiowano");
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
          <Badge>{STATUS_LABEL[pkg.status]}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {pkg.trackingNumber && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Numer: {pkg.trackingNumber}
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
            <p className="text-sm text-muted-foreground">Kurier: {pkg.courier}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Przyjęta: {format(new Date(pkg.receivedAt), "dd.MM.yyyy HH:mm")}
          </p>
          {pkg.recipient && (
            <p className="text-sm text-muted-foreground">
              Odbiorca: {pkg.recipient.email}
            </p>
          )}
          {canMarkPickedUp && pkg.status !== "PICKED_UP" && (
            <Button size="sm" onClick={handlePickup} disabled={isUpdating} className="mt-2">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isUpdating ? "Zapisywanie..." : "Wydaj"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
