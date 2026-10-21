import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Megaphone, Package } from "lucide-react";
import { getCurrentUser } from "@/auth/session";
import { listPackagesForViewer } from "@/domain/packages";
import { listReports } from "@/domain/reports";
import { getProfile } from "@/domain/profile";
import { summarizeDashboard } from "@/domain/dashboard/summary";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EmptyState } from "@/components/system/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Role } from "@/lib/generated/prisma";
import { Interactive } from "@/components/motion/Interactive";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

export default async function Home() {
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const tr = await getTranslations("reports");
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-3xl font-bold">{t("welcome")}</h1>
        <p className="text-muted-foreground">
          {t("tagline")}
        </p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/sign-in">{tc("signIn")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-up">{tc("signUp")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ponytail: first membership's community, same as /packages; needs a
  // community switcher once a user can belong to more than one.
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const isStaff = membership.role !== Role.RESIDENT;
  const canAdmin = membership.role === Role.ADMIN || membership.role === Role.MANAGER;

  // ponytail: counts in memory from the full lists; switch to count() queries if lists grow.
  const [packages, reports, profile] = await Promise.all([
    listPackagesForViewer(user, membership.communityId),
    listReports(user, membership.communityId),
    getProfile(user, membership.communityId),
  ]);
  const format = await getFormatter();
  const s = summarizeDashboard({ userId: user.id, packages, reports });

  const apt = profile.apartment;
  const aptLine = apt
    ? [
        profile.building
          ? t("myApartmentLine", { building: profile.building.name, apartment: apt.number })
          : t("myApartmentNoBuilding", { apartment: apt.number }),
        profile.parkingSpaces.length &&
          t("parkingShort", { numbers: profile.parkingSpaces.map((x) => x.number).join(", ") }),
        profile.storageUnits.length &&
          t("storageShort", { numbers: profile.storageUnits.map((x) => x.number).join(", ") }),
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <Stagger className="space-y-6">
      <StaggerItem index={0}>
        <h1 className="text-3xl font-bold">{t("greeting", { name: user.firstName ?? user.email })}</h1>
      </StaggerItem>

      {aptLine && (
        <StaggerItem index={1}>
        <Card>
          <CardHeader>
            <CardTitle>{t("myApartment")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{aptLine}</p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="sm">
              <Link href="/profile">{t("viewProfile")}</Link>
            </Button>
          </CardFooter>
        </Card>
        </StaggerItem>
      )}

      {isStaff ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: t("waitingForPickup"), value: s.waitingPackageCount, href: "/packages" },
              { label: t("newReports"), value: s.newReportCount, href: "/reports?status=NEW" },
              { label: t("urgentReports"), value: s.urgentReportCount, href: "/reports?urgent=1" },
            ].map((c, i) => (
              <StaggerItem key={c.label} index={2 + i} className="h-full">
                <Interactive className="h-full">
                  <Link href={c.href} className="block h-full">
                    <Card className="transition-colors hover:bg-muted/50">
                      <CardHeader>
                        <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-4xl font-bold">{c.value}</p>
                      </CardContent>
                    </Card>
                  </Link>
                </Interactive>
              </StaggerItem>
            ))}
          </div>
          <StaggerItem index={5} className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/packages">{t("addPackage")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/reports">{t("reports")}</Link>
            </Button>
            {canAdmin && (
              <Button asChild variant="outline">
                <Link href="/admin">{t("admin")}</Link>
              </Button>
            )}
          </StaggerItem>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <StaggerItem index={2} className="h-full [&>*]:h-full">
              <Card>
                <CardHeader>
                  <CardTitle>{t("packagesToPickup", { count: s.waitingPackageCount })}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {s.waitingPackages.length === 0 ? (
                    <EmptyState icon={Package} title={t("nothingWaiting")} />
                  ) : (
                    s.waitingPackages.map((p) => (
                      <div key={p.id} className="text-sm">
                        <p className="font-medium">
                          {p.building.name} / {p.apartment.number}
                        </p>
                        <p className="text-muted-foreground">
                          {p.courier ? `${p.courier}, ` : ""}
                          {format.dateTime(new Date(p.receivedAt), { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline">
                    <Link href="/packages">{t("viewPackages")}</Link>
                  </Button>
                </CardFooter>
              </Card>
            </StaggerItem>
            <StaggerItem index={3} className="h-full [&>*]:h-full">
              <Card>
                <CardHeader>
                  <CardTitle>{t("myReports", { count: s.myOpenReportCount })}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {s.myOpenReports.length === 0 ? (
                    <EmptyState icon={Megaphone} title={t("noOpenReports")} />
                  ) : (
                    s.myOpenReports.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{r.title}</span>
                        <Badge>{tr(`status.${r.status}`)}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline">
                    <Link href="/reports?view=mine">{t("viewReports")}</Link>
                  </Button>
                </CardFooter>
              </Card>
            </StaggerItem>
          </div>
          <StaggerItem index={4}>
            <Button asChild>
              <Link href="/reports">{t("newReport")}</Link>
            </Button>
          </StaggerItem>
        </>
      )}
    </Stagger>
  );
}
