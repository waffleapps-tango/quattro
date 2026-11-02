import { clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export const UNASSIGNED_CLERK_LIMIT = 25;

// TEMPORARY: emails of the newest Clerk users (at most UNASSIGNED_CLERK_LIMIT are
// fetched) who have no membership yet.
export async function listUnassignedClerkEmails(): Promise<string[]> {
  const client = await clerkClient();
  const { data } = await client.users.getUserList({
    limit: UNASSIGNED_CLERK_LIMIT,
    orderBy: "-created_at",
  });

  const emails = data
    .map((u) => u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress)
    .filter((e): e is string => Boolean(e));

  const assigned = await prisma.user.findMany({
    where: { email: { in: emails }, memberships: { some: {} } },
    select: { email: true },
  });
  const assignedSet = new Set(assigned.map((u) => u.email));
  return emails.filter((e) => !assignedSet.has(e));
}
