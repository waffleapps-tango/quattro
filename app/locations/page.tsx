import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Utensils, GraduationCap, Stethoscope, Dumbbell, ShoppingCart, School } from "lucide-react";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("locations"), description: t("locationsDescription") };
}

const estateFacilities = [
  { key: "kindergarten", icon: GraduationCap },
  { key: "sushi", icon: Utensils },
  { key: "medical", icon: Stethoscope },
  { key: "gym", icon: Dumbbell },
] as const;

const nearbyLocations = [
  { key: "mall", icon: ShoppingCart, km: 0.5 },
  { key: "school", icon: School, km: 0.8 },
] as const;

export default async function LocationsPage() {
  const t = await getTranslations("locations");
  const format = await getFormatter();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-4">{t("estateHeading")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {estateFacilities.map(({ key, icon: Icon }) => (
              <Card key={key}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{t(`estate.${key}.name`)}</CardTitle>
                  </div>
                  <CardDescription>{t(`estate.${key}.category`)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`estate.${key}.description`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">{t("nearbyHeading")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {nearbyLocations.map(({ key, icon: Icon, km }) => (
              <Card key={key}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{t(`nearby.${key}.name`)}</CardTitle>
                  </div>
                  <CardDescription>
                    {t("categoryDistance", {
                      category: t(`nearby.${key}.category`),
                      distance: t("distance", { km: format.number(km) }),
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`nearby.${key}.description`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
