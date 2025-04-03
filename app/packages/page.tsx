import { Package as PackageType } from "@/types/package";
import { PackagesList } from "@/components/packages/PackagesList";

const mockPackages: PackageType[] = [
  {
    id: "1",
    recipientName: "John Doe",
    trackingNumber: "TRK123456",
    status: "arrived",
    arrivalDate: "2024-03-20",
  },
  {
    id: "2",
    recipientName: "Jane Smith",
    trackingNumber: "TRK789012",
    status: "notified",
    arrivalDate: "2024-03-19",
  },
  {
    id: "3",
    recipientName: "Mike Johnson",
    trackingNumber: "TRK345678",
    status: "picked_up",
    arrivalDate: "2024-03-18",
  },
];

export default function PackagesPage() {
  return (
    <div className="container mx-auto pb-8">
      <h1 className="text-3xl font-bold mb-6">Packages Management</h1>
      <PackagesList initialPackages={mockPackages} />
    </div>
  );
} 