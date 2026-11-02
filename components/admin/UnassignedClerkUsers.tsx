import { listUnassignedClerkEmails, UNASSIGNED_CLERK_LIMIT } from "@/domain/memberships/unassigned";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// TEMPORARY: lets an admin copy a new sign-up's email into "Add".
export async function UnassignedClerkUsers() {
  const unassigned = await listUnassignedClerkEmails();

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Unassigned Clerk users (newest {UNASSIGNED_CLERK_LIMIT}, temporary)</CardTitle>
      </CardHeader>
      <CardContent>
        {unassigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="space-y-1 text-sm font-mono">
            {unassigned.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
