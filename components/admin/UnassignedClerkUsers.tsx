import { listUnassignedClerkEmails, UNASSIGNED_CLERK_LIMIT } from "@/domain/memberships/unassigned";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// TEMPORARY: lets an admin copy a new sign-up's email into "Add".
export async function UnassignedClerkUsers() {
  const t = await getTranslations("admin");
  const unassigned = await listUnassignedClerkEmails();

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{t("unassignedTitle", { limit: UNASSIGNED_CLERK_LIMIT })}</CardTitle>
      </CardHeader>
      <CardContent>
        {unassigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("unassignedNone")}</p>
        ) : (
          <ul className="space-y-1 break-all font-mono text-sm">
            {unassigned.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
