"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Bell, Package, Loader2, Copy } from "lucide-react";
import { Package as PackageType, PackageStatus, PACKAGE_STATUS_CONFIG, PackageIconName } from "@/types/package";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

const iconMap: Record<PackageIconName, typeof Package> = {
  Package,
  Bell,
  CheckCircle2,
};

interface PackageCardProps {
  pkg: PackageType;
  onStatusUpdate: (id: string, newStatus: PackageStatus) => Promise<void>;
  isLoading: boolean;
}

export function PackageCard({ pkg, onStatusUpdate, isLoading }: PackageCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const getStatusBadge = (status: PackageStatus) => {
    const config = PACKAGE_STATUS_CONFIG[status];
    const Icon = iconMap[config.icon];

    return (
      <Badge className={`${config.color} text-white`}>
        <Icon className="w-4 h-4 mr-1" />
        {config.text}
      </Badge>
    );
  };

  const handleStatusUpdate = async (newStatus: PackageStatus) => {
    setIsUpdating(true);
    try {
      await onStatusUpdate(pkg.id, newStatus);
      toast.success("Status Updated", {
        description: `Package status has been updated to ${PACKAGE_STATUS_CONFIG[newStatus].text}`,
      });
    } catch (error) {
      toast.error("Error", {
        description: "Failed to update package status",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", {
        description: "Text copied to clipboard",
      });
    } catch (error) {
      toast.error("Error", {
        description: "Failed to copy text",
      });
    }
  };

  return (
    <Card className="relative">
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{pkg.recipientName}</span>
          {getStatusBadge(pkg.status)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Tracking: {pkg.trackingNumber}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(pkg.trackingNumber)}
              className="h-6 w-6"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-500">
            Arrival: {format(new Date(pkg.arrivalDate), "dd.MM.yyyy")}
          </p>
          <div className="flex gap-2 mt-4">
            {pkg.status === "arrived" && (
              <Button
                size="sm"
                onClick={() => handleStatusUpdate("notified")}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Mark as Notified"
                )}
              </Button>
            )}
            {pkg.status === "notified" && (
              <Button
                size="sm"
                onClick={() => handleStatusUpdate("picked_up")}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Mark as Picked Up"
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 