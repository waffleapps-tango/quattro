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

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search by recipient or tracking number..."
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select 
          value={statusFilter} 
          onValueChange={(value: PackageStatus | "all") => setStatusFilter(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="arrived">Arrived</SelectItem>
            <SelectItem value="notified">Notified</SelectItem>
            <SelectItem value="picked_up">Picked Up</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {!isLoading && filteredPackages.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No packages found matching your criteria.</AlertDescription>
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