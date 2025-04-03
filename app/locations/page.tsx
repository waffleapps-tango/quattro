import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Utensils, GraduationCap, Stethoscope, Dumbbell, ShoppingCart, School } from "lucide-react";

export const metadata: Metadata = {
  title: "Locations | Quattro",
  description: "Explore estate facilities and nearby points of interest",
};

const estateFacilities = [
  {
    name: "Kindergarten",
    description: "Modern kindergarten with experienced staff",
    icon: GraduationCap,
    category: "Education",
  },
  {
    name: "Sushi Restaurant",
    description: "Authentic Japanese cuisine",
    icon: Utensils,
    category: "Dining",
  },
  {
    name: "Medical Center",
    description: "General practitioners and specialists",
    icon: Stethoscope,
    category: "Healthcare",
  },
  {
    name: "Fitness Center",
    description: "24/7 gym with modern equipment",
    icon: Dumbbell,
    category: "Sports",
  },
];

const nearbyLocations = [
  {
    name: "City Mall",
    description: "Large shopping center with various stores",
    icon: ShoppingCart,
    category: "Shopping",
    distance: "0.5 km",
  },
  {
    name: "Primary School",
    description: "Public primary school with excellent ratings",
    icon: School,
    category: "Education",
    distance: "0.8 km",
  },
];

export default function LocationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Locations</h1>
        <p className="text-muted-foreground">
          Explore facilities within the estate and nearby points of interest.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Estate Facilities</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {estateFacilities.map((facility) => {
              const Icon = facility.icon;
              return (
                <Card key={facility.name}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{facility.name}</CardTitle>
                    </div>
                    <CardDescription>{facility.category}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {facility.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">Nearby Locations</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {nearbyLocations.map((location) => {
              const Icon = location.icon;
              return (
                <Card key={location.name}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{location.name}</CardTitle>
                    </div>
                    <CardDescription>
                      {location.category} • {location.distance} away
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {location.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
} 