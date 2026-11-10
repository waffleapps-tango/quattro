import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowRight, Megaphone, Package } from "lucide-react";
import { getCurrentUser } from "@/auth/session";
import { listPackagesForViewer } from "@/domain/packages";
import { listReports } from "@/domain/reports";
import { getProfile } from "@/domain/profile";
import { summarizeDashboard } from "@/domain/dashboard/summary";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EmptyState } from "@/components/system/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Role } from "@/lib/generated/prisma";
import { statusVariant } from "@/components/reports/status";
import { Interactive } from "@/components/motion/Interactive";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

export default async function Home() {
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const tr = await getTranslations("reports");
  const tp = await getTranslations("packages");
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

  const extras = [
    profile.parkingSpaces.length &&
      t("parkingShort", { numbers: profile.parkingSpaces.map((x) => x.number).join(", ") }),
    profile.storageUnits.length &&
      t("storageShort", { numbers: profile.storageUnits.map((x) => x.number).join(", ") }),
  ]
    .filter(Boolean)
    .join(" · ");
  const aptLines = [
    ...profile.apartments.map((a) =>
      t("myApartmentLine", { building: a.building.name, apartment: a.number }),
    ),
    ...(extras ? [extras] : []),
  ];

  const daysSince = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

  return (
    <Stagger className="space-y-6">
      <StaggerItem index={0}>
        <h1 className="text-3xl font-semibold">{t("greeting", { name: user.firstName ?? user.email })}</h1>
      </StaggerItem>

      {profile.apartments.length > 0 && (
        <StaggerItem index={1}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t("myApartment")}
                </p>
                <ul className="space-y-1">
                  {aptLines.map((line, idx) => (
                    <li key={line} className={idx === 0 ? "font-heading text-xl font-semibold" : "text-sm text-muted-foreground"}>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <Button asChild variant="secondary">
                <Link href="/profile">{t("viewProfile")}</Link>
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>
      )}

      {isStaff ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: t("waitingForPickup"), value: s.waitingPackageCount, href: "/packages", icon: Package, tint: "bg-info text-info-foreground" },
              { label: t("newReports"), value: s.newReportCount, href: "/reports?status=NEW", icon: Megaphone, tint: "bg-warm text-warm-foreground" },
              { label: t("urgentReports"), value: s.urgentReportCount, href: "/reports?urgent=1", icon: AlertTriangle, tint: "bg-danger text-danger-foreground" },
            ].map((c, i) => (
              <StaggerItem key={c.label} index={2 + i} className="h-full">
                <Interactive className="h-full">
                  <Link href={c.href} className="block h-full">
                    <Card className="h-full transition-colors hover:bg-muted/50">
                      <CardContent className="flex items-center justify-between gap-4">
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{c.label}</p>
                          <p className="font-heading text-4xl font-semibold tabular-nums">{c.value}</p>
                        </div>
                        <span className={`grid h-11 w-11 place-items-center rounded-xl ${c.tint}`}>
                          <c.icon className="h-5 w-5" aria-hidden="true" />
                        </span>
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
            <Button asChild variant="secondary">
              <Link href="/reports">{t("reports")}</Link>
            </Button>
            {canAdmin && (
              <Button asChild variant="secondary">
                <Link href="/admin">{t("admin")}</Link>
              </Button>
            )}
          </StaggerItem>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <StaggerItem index={2} className="h-full [&>*]:h-full">
              <Card className="gap-0 overflow-hidden py-0">
                <div className="flex items-center gap-3 bg-muted px-6 py-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-info text-info-foreground">
                    <Package className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="font-heading text-lg font-semibold">
                    {t("packagesToPickup", { count: s.waitingPackageCount })}
                  </h2>
                </div>
                <CardContent className="space-y-2 py-5">
                  {s.waitingPackages.length === 0 ? (
                    <EmptyState icon={Package} title={t("nothingWaiting")} />
                  ) : (
                    s.waitingPackages.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-medium">
                            {p.courier ?? `${p.building.name} / ${p.apartment.number}`}
                            {p.trackingNumber && (
                              <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                {p.trackingNumber}
                              </span>
                            )}
                          </p>
                          <p className="text-muted-foreground">
                            {p.courier && `${p.building.name} / ${p.apartment.number} · `}
                            {format.dateTime(new Date(p.receivedAt), { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-warm-foreground">
                          {tp("waitingDays", { count: daysSince(p.receivedAt) })}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
                <CardFooter className="pb-6">
                  <Button asChild variant="secondary">
                    <Link href="/packages">{t("viewPackages")}<ArrowRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                </CardFooter>
              </Card>
            </StaggerItem>
            <StaggerItem index={3} className="h-full [&>*]:h-full">
              <Card className="gap-0 overflow-hidden py-0">
                <div className="flex items-center gap-3 bg-muted px-6 py-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-warm text-warm-foreground">
                    <Megaphone className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="font-heading text-lg font-semibold">
                    {t("myReports", { count: s.myOpenReportCount })}
                  </h2>
                </div>
                <CardContent className="space-y-2 py-5">
                  {s.myOpenReports.length === 0 ? (
                    <EmptyState icon={Megaphone} title={t("noOpenReports")} />
                  ) : (
                    s.myOpenReports.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
                        <span className="min-w-0 truncate font-medium">{r.title}</span>
                        <Badge variant={statusVariant(r.status)}>{tr(`status.${r.status}`)}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
                <CardFooter className="gap-2 pb-6">
                  <Button asChild>
                    <Link href="/reports">{t("newReport")}</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/reports?view=mine">{t("viewReports")}<ArrowRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                </CardFooter>
              </Card>
            </StaggerItem>
          </div>
        </>
      )}
    </Stagger>
  );
}
