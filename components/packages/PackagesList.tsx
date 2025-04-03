"use client";

import { useState, ChangeEvent } from "react";
import { Package as PackageType, PackageStatus } from "@/types/package";
import { PackageCard } from "./PackageCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PackagesListProps {
  initialPackages: PackageType[];
}

export function PackagesList({ initialPackages }: PackagesListProps) {
  const [packages, setPackages] = useState<PackageType[]>(initialPackages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PackageStatus | "all">("all");

  const updatePackageStatus = async (id: string, newStatus: PackageStatus) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setPackages((prevPackages) =>
        prevPackages.map((pkg) =>
          pkg.id === id ? { ...pkg, status: newStatus } : pkg
        )
      );
    } catch (err) {
      setError("Failed to update package status. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPackages = packages.filter((pkg) => {
    const matchesSearch = pkg.recipientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         pkg.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || pkg.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">Packages</h2>
          <p className="text-muted-foreground">
            Manage and track packages in the reception.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Search packages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as PackageStatus | "all")}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="collected">Collected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPackages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onStatusUpdate={updatePackageStatus}
              isLoading={isLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
} 