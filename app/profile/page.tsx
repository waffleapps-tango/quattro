import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EmptyState } from "@/components/system/EmptyState";
import { Illustration } from "@/components/system/Illustration";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/auth/session";
import { getProfile } from "@/domain/profile";
import { ShareNameToggle } from "@/components/profile/ShareNameToggle";
import { ApartmentPeople } from "@/components/profile/ApartmentPeople";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { initials } from "@/lib/text";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("profile") };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export default async function ProfilePage() {
  const t = await getTranslations("profile");
  const tAdmin = await getTranslations("admin");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: uses the first membership like /packages does; needs a
  // community switcher once a user can belong to more than one.
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const p = await getProfile(user, membership.communityId);
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email;
  const avatar = initials(name);
  const reportLink = (
    <CardFooter>
      <Button asChild variant="outline" size="sm">
        <Link href="/reports">{t("reportProblem")}</Link>
      </Button>
    </CardFooter>
  );

  return (
    <Stagger className="container mx-auto space-y-6 pb-8">
      <StaggerItem index={0} className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-xl">{avatar}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-bold">{name}</h1>
          <p className="truncate text-sm text-muted-foreground">{p.email}</p>
          <Badge variant="secondary">
            {tAdmin(`role.${p.role}`)}
          </Badge>
        </div>
      </StaggerItem>

      <div>
        <ShareNameToggle initial={user.shareName} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {p.apartments.length > 0 ? (
          p.apartments.map((a, i) => (
            <StaggerItem key={a.id} index={1 + i} className="md:col-span-2 h-full [&>*]:h-full">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <Illustration name="floor-plan" size={72} />
                    {p.apartments.length > 1
                      ? t("apartmentCardNumbered", { building: a.building.name, number: a.number })
                      : t("apartmentCard")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Row label={t("community")} value={[p.community.name, p.community.address].filter(Boolean).join(", ")} />
                    <Row label={t("building")} value={[a.building.name, a.building.address].filter(Boolean).join(", ")} />
                    <Row label={t("apartment")} value={a.number} />
                    {a.floor != null && <Row label={t("floor")} value={String(a.floor)} />}
                  </dl>
                  {a.myLink && (
                    <ApartmentPeople apartmentId={a.id} myLink={a.myLink} people={a.people} />
                  )}
                </CardContent>
              </Card>
            </StaggerItem>
          ))
        ) : (
          <StaggerItem index={1} className="md:col-span-2 h-full [&>*]:h-full">
            <Card>
              <CardHeader>
                <CardTitle>{t("apartmentCard")}</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState illustration="floor-plan" title={t("noApartmentTitle")} description={t("noApartmentHint")} />
              </CardContent>
            </Card>
          </StaggerItem>
        )}

        <StaggerItem index={2 + p.apartments.length} className="h-full [&>*]:h-full">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Illustration name="parking" size={72} />
                {t("parkingCard")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {p.parkingSpaces.length ? (
                <ul className="space-y-2">
                  {p.parkingSpaces.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="font-medium">{s.number}</span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {s.level && <span>{t("levelValue", { level: s.level })}</span>}
                        {s.hasEvCharger && <Badge variant="secondary">{t("evCharger")}</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noParking")}</p>
              )}
            </CardContent>
            {p.parkingSpaces.length > 0 && reportLink}
          </Card>
        </StaggerItem>

        <StaggerItem index={3 + p.apartments.length} className="h-full [&>*]:h-full">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Illustration name="storage" size={72} />
                {t("storageCard")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {p.storageUnits.length ? (
                <ul className="space-y-2">
                  {p.storageUnits.map((u) => (
                    <li key={u.id} className="font-medium">{u.number}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noStorage")}</p>
              )}
            </CardContent>
            {p.storageUnits.length > 0 && reportLink}
          </Card>
        </StaggerItem>
      </div>
    </Stagger>
  );
}
