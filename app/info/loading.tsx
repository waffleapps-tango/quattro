import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default async function Loading() {
  const t = await getTranslations("common");
  return (
    <div className="container mx-auto pb-8" aria-busy="true" role="status">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-9 w-40 mb-6" />
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-2/3" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
