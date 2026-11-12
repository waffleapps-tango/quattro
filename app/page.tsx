import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, Plus } from "lucide-react";
import { getCurrentUser } from "@/auth/session";
import { listPackagesForViewer } from "@/domain/packages";
import { listReports } from "@/domain/reports";
import { getProfile } from "@/domain/profile";
import { summarizeDashboard } from "@/domain/dashboard/summary";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EmptyState } from "@/components/system/EmptyState";
import { HeroIllustration, Illustration } from "@/components/system/Illustration";
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
  const tProfile = await getTranslations("profile");
  const tPeople = await getTranslations("profile.people");
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <HeroIllustration name="building" priority />
        <h1 className="text-2xl font-bold sm:text-3xl">{t("welcome")}</h1>
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
  const [{ items: packages, total: waitingTotal }, reports, profile] = await Promise.all([
    listPackagesForViewer(user, membership.communityId),
    listReports(user, membership.communityId),
    getProfile(user, membership.communityId),
  ]);
  const format = await getFormatter();
  const s = summarizeDashboard({ userId: user.id, packages, reports });

  const daysSince = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

  return (
    <Stagger className="space-y-6">
      <StaggerItem index={0}>
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {profile.community.name}
        </p>
        <h1 className="text-2xl font-semibold sm:text-3xl">{t("greeting", { name: user.firstName ?? user.email })}</h1>
      </StaggerItem>

      {profile.apartments.length > 0 && (
        <StaggerItem index={1}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
              <Illustration name="floor-plan" size={96} className="hidden sm:block" />
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t("myApartment")}
                </p>
                {profile.apartments.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-2xl font-semibold tracking-tight">
                      {a.building.name} / {a.number}
                    </span>
                    {a.myLink && <Badge variant="secondary">{tPeople(`kind.${a.myLink.kind}`)}</Badge>}
                    {a.floor != null && (
                      <Badge variant="warm">
                        {tProfile("floor")} {a.floor}
                      </Badge>
                    )}
                  </div>
                ))}
                {(profile.parkingSpaces.length > 0 || profile.storageUnits.length > 0) && (
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {profile.parkingSpaces.length > 0 && (
                      <span>
                        {tProfile("parkingCard")}:{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {profile.parkingSpaces.map((x) => x.number).join(", ")}
                        </span>
                      </span>
                    )}
                    {profile.storageUnits.length > 0 && (
                      <span>
                        {tProfile("storageCard")}:{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {profile.storageUnits.map((x) => x.number).join(", ")}
                        </span>
                      </span>
                    )}
                  </p>
                )}
              </div>
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
            {([
              { label: t("waitingForPickup"), value: waitingTotal, href: "/packages", art: "parcel" },
              { label: t("newReports"), value: s.newReportCount, href: "/reports?status=NEW", art: "maintenance" },
              { label: t("urgentReports"), value: s.urgentReportCount, href: "/reports?urgent=1", art: "urgent" },
            ] as const).map((c, i) => (
              <StaggerItem key={c.label} index={2 + i} className="h-full">
                <Interactive className="h-full">
                  <Link href={c.href} className="block h-full">
                    <Card className="h-full transition-colors hover:bg-muted/50">
                      <CardContent className="flex items-center justify-between gap-4">
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{c.label}</p>
                          <p className="font-heading text-4xl font-semibold tabular-nums">{c.value}</p>
                        </div>
                        <Illustration name={c.art} size={96} />
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
            <StaggerItem index={2} className="h-full min-w-0 [&>*]:h-full">
              <Card className="gap-0 overflow-hidden py-0">
                <div className="flex items-center gap-3 bg-muted px-6 py-4">
                  <Illustration name="parcel" size={72} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-heading text-lg font-semibold leading-tight">{t("packagesHeading")}</h2>
                    <p className="truncate text-sm text-muted-foreground">{t("packagesSubtitle")}</p>
                  </div>
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold tabular-nums text-primary-foreground">
                    {waitingTotal}
                  </span>
                </div>
                <CardContent className="space-y-2 py-5">
                  {s.waitingPackages.length === 0 ? (
                    <EmptyState illustration="locker" title={t("nothingWaiting")} />
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
                        {daysSince(p.receivedAt) >= 1 && (
                          <span className="shrink-0 text-xs font-medium text-warm-foreground">
                            {tp("waitingDays", { count: daysSince(p.receivedAt) })}
                          </span>
                        )}
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
            <StaggerItem index={3} className="h-full min-w-0 [&>*]:h-full">
              <Card className="gap-0 overflow-hidden py-0">
                <div className="flex flex-wrap items-center gap-3 bg-muted px-6 py-4">
                  <Illustration name="maintenance" size={72} />
                  {/* basis keeps the title readable; the button wraps to its own row instead of squeezing it */}
                  <div className="min-w-0 flex-1 basis-40">
                    <h2 className="font-heading text-lg font-semibold leading-tight">{t("reportsHeading")}</h2>
                    <p className="text-sm text-muted-foreground">{t("reportsSubtitle")}</p>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/reports">
                      <Plus className="mr-1 h-4 w-4" />
                      {t("newReport")}
                    </Link>
                  </Button>
                </div>
                <CardContent className="space-y-2 py-5">
                  {s.myOpenReports.length === 0 ? (
                    <EmptyState illustration="all-clear" title={t("noOpenReports")} />
                  ) : (
                    s.myOpenReports.map((r) => (
                      <div key={r.id} className="rounded-lg bg-muted px-4 py-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em]">
                              {tr(`type.${r.type}`)}
                            </span>
                            <span className="truncate font-medium">{r.title}</span>
                          </span>
                          <Badge variant={statusVariant(r.status)}>{tr(`status.${r.status}`)}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {t("reportedOn", {
                            date: format.dateTime(new Date(r.createdAt), { day: "2-digit", month: "2-digit", year: "numeric" }),
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
                <CardFooter className="pb-6">
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
