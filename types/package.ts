import { LucideIcon } from "lucide-react";

export type PackageStatus = "arrived" | "notified" | "picked_up";
export type PackageIconName = "Package" | "Bell" | "CheckCircle2";

export interface Package {
  id: string;
  recipientName: string;
  trackingNumber: string;
  status: PackageStatus;
  arrivalDate: string;
}

export interface PackageStatusConfig {
  color: string;
  text: string;
  icon: PackageIconName;
}

export const PACKAGE_STATUS_CONFIG: Record<PackageStatus, PackageStatusConfig> = {
  arrived: { 
    color: "bg-blue-500", 
    text: "Arrived", 
    icon: "Package" 
  },
  notified: { 
    color: "bg-yellow-500", 
    text: "Notified", 
    icon: "Bell" 
  },
  picked_up: { 
    color: "bg-green-500", 
    text: "Picked Up", 
    icon: "CheckCircle2" 
  },
}; 