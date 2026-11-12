import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { AccessDenied } from "@/components/system/AccessDenied";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JoinRequestList } from "@/components/admin/JoinRequestList";
import { ReceptionApprovalSwitch } from "@/components/admin/ReceptionApprovalSwitch";
import { getCurrentUser } from "@/auth/session";
import { listJoinRequests, listUsersWithoutRequest, requireApprover } from "@/domain/join-requests";
import { listBuildingsForCommunity, listApartmentsForBuilding } from "@/domain/communities/queries";
import { Role } from "@/lib/generated/prisma";
import { UnauthorizedError } from "@/domain/errors";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("admin") };
}

export default async function AdminRequestsPage() {
  const t = await getTranslations("admin.requests");
  const format = await getFormatter();
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  let community;
  try {
    ({ community } = await requireApprover(user, membership.communityId));
  } catch (error) {
    if (error instanceof UnauthorizedError) return <AccessDenied />;
    throw error;
  }

  const communityId = membership.communityId;
  // The setting and the "Users" tab are manager business; a receptionist only decides requests.
  const isManager = membership.role === Role.MANAGER || membership.role === Role.ADMIN;
  const [{ pending, decided }, withoutRequest, buildings] = await Promise.all([
    listJoinRequests(user, communityId),
    listUsersWithoutRequest(user, communityId),
    listBuildingsForCommunity(communityId),
  ]);
  const apartmentLists = await Promise.all(buildings.map((building) => listApartmentsForBuilding(building.id)));
  const apartmentsByBuilding = Object.fromEntries(
    buildings.map((building, i) => [building.id, apartmentLists[i].map((a) => ({ id: a.id, number: a.number }))]),
  );

  return (
    <div className="space-y-6">
      {isManager && (
        <ReceptionApprovalSwitch communityId={communityId} initial={community.receptionCanApproveJoinRequests} />
      )}
      <JoinRequestList
        pending={pending}
        decided={decided}
        buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
        apartmentsByBuilding={apartmentsByBuilding}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("withoutRequest")}</CardTitle>
          <CardDescription>{t("withoutRequestHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {withoutRequest.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("withoutRequestNone")}</p>
          ) : (
            <ul className="divide-y">
              {withoutRequest.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("signedUp", { date: format.dateTime(u.createdAt, { dateStyle: "medium" }) })}
                    </p>
                  </div>
                  {isManager && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/users?invite=${encodeURIComponent(u.email)}`}>{t("assign")}</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
