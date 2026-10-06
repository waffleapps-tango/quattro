import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { UnauthorizedError } from "@/domain/errors";
import type { Membership, Role, User } from "@/lib/generated/prisma";

export type SessionUser = User & { memberships: Membership[] };

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const existing = await prisma.user.findUnique({
    where: { clerkUserId },
    include: { memberships: true },
  });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  // ponytail: upsert-by-email on first login has a race if the same person
  // logs in twice concurrently before this resolves. Fine for MVP traffic;
  // if it becomes real, move this to a DB-level upsert with a unique
  // constraint conflict handler instead of find-then-branch.
  try {
    return await prisma.user.update({
      where: { email },
      data: { clerkUserId },
      include: { memberships: true },
    });
  } catch {
    return await prisma.user.create({
      data: { clerkUserId, email },
      include: { memberships: true },
    });
  }
}

export function requireMembership(
  user: SessionUser,
  communityId: string,
  allowedRoles: Role[],
): Membership {
  const membership = user.memberships.find(
    (m) => m.communityId === communityId && allowedRoles.includes(m.role),
  );
  if (!membership) {
    throw new UnauthorizedError(
      `User ${user.id} lacks an allowed role in community ${communityId}`,
    );
  }
  return membership;
}
