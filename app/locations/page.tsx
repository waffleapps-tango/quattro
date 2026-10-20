import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Utensils, GraduationCap, Stethoscope, Dumbbell, ShoppingCart, School } from "lucide-react";

export const metadata: Metadata = {
  title: "Lokalizacje",
  description: "Odkryj udogodnienia osiedla i ciekawe miejsca w okolicy",
};

const estateFacilities = [
  {
    name: "Przedszkole",
    description: "Nowoczesne przedszkole z doświadczoną kadrą",
    icon: GraduationCap,
    category: "Edukacja",
  },
  {
    name: "Restauracja sushi",
    description: "Autentyczna kuchnia japońska",
    icon: Utensils,
    category: "Gastronomia",
  },
  {
    name: "Centrum medyczne",
    description: "Lekarze rodzinni i specjaliści",
    icon: Stethoscope,
    category: "Zdrowie",
  },
  {
    name: "Siłownia",
    description: "Siłownia czynna całą dobę z nowoczesnym sprzętem",
    icon: Dumbbell,
    category: "Sport",
  },
];

const nearbyLocations = [
  {
    name: "Centrum handlowe",
    description: "Duże centrum handlowe z wieloma sklepami",
    icon: ShoppingCart,
    category: "Zakupy",
    distance: "0,5 km",
  },
  {
    name: "Szkoła podstawowa",
    description: "Publiczna szkoła podstawowa z doskonałymi opiniami",
    icon: School,
    category: "Edukacja",
    distance: "0,8 km",
  },
];

export default function LocationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Lokalizacje</h1>
        <p className="text-muted-foreground">
          Odkryj udogodnienia na osiedlu i ciekawe miejsca w okolicy.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Udogodnienia osiedla</h2>
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
          <h2 className="text-2xl font-semibold mb-4">W okolicy</h2>
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
                      {location.category} • {location.distance} stąd
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