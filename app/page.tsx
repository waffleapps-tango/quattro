import Link from "next/link";
import { format } from "date-fns";
import { Megaphone, Package } from "lucide-react";
import { getCurrentUser } from "@/auth/session";
import { listPackagesForViewer } from "@/domain/packages";
import { listReports } from "@/domain/reports";
import { STATUS_LABEL } from "@/domain/reports/labels";
import { summarizeDashboard } from "@/domain/dashboard/summary";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EmptyState } from "@/components/system/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Role } from "@/lib/generated/prisma";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-3xl font-bold">Witaj w Quattro</h1>
        <p className="text-muted-foreground">
          Paczki i zgłoszenia dla Twojego osiedla w jednym miejscu.
        </p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/sign-in">Zaloguj się</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-up">Załóż konto</Link>
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
  const [packages, reports] = await Promise.all([
    listPackagesForViewer(user, membership.communityId),
    listReports(user, membership.communityId),
  ]);
  const s = summarizeDashboard({ userId: user.id, packages, reports });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dzień dobry, {user.firstName ?? user.email}</h1>

      {isStaff ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Paczki czekające na wydanie", value: s.waitingPackageCount, href: "/packages" },
              { label: "Nowe zgłoszenia", value: s.newReportCount, href: "/reports?status=NEW" },
              { label: "Pilne zgłoszenia", value: s.urgentReportCount, href: "/reports?urgent=1" },
            ].map((c) => (
              <Link key={c.label} href={c.href}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold">{c.value}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/packages">Dodaj paczkę</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/reports">Zgłoszenia</Link>
            </Button>
            {canAdmin && (
              <Button asChild variant="outline">
                <Link href="/admin">Administracja</Link>
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Paczki do odbioru ({s.waitingPackageCount})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {s.waitingPackages.length === 0 ? (
                  <EmptyState icon={Package} title="Nic na Ciebie nie czeka" />
                ) : (
                  s.waitingPackages.map((p) => (
                    <div key={p.id} className="text-sm">
                      <p className="font-medium">
                        {p.building.name} / {p.apartment.number}
                      </p>
                      <p className="text-muted-foreground">
                        {p.courier ? `${p.courier}, ` : ""}
                        {format(new Date(p.receivedAt), "dd.MM.yyyy")}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline">
                  <Link href="/packages">Zobacz paczki</Link>
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Moje zgłoszenia ({s.myOpenReportCount})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {s.myOpenReports.length === 0 ? (
                  <EmptyState icon={Megaphone} title="Brak otwartych zgłoszeń" />
                ) : (
                  s.myOpenReports.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{r.title}</span>
                      <Badge>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline">
                  <Link href="/reports?view=mine">Zobacz zgłoszenia</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
          <Button asChild>
            <Link href="/reports">Nowe zgłoszenie</Link>
          </Button>
        </>
      )}
    </div>
  );
}
