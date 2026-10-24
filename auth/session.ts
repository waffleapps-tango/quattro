import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { UnauthorizedError } from "@/domain/errors";
import { Prisma, type ApartmentResidency, type Membership, type Role, type User } from "@/lib/generated/prisma";

export type SessionUser = User & {
  memberships: Membership[];
  residencies: ApartmentResidency[];
};

const sessionInclude = {
  memberships: { orderBy: { createdAt: "asc" } },
  residencies: true,
} satisfies Prisma.UserInclude;

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const existing = await prisma.user.findUnique({
    where: { clerkUserId },
    include: sessionInclude,
  });
  if (existing) return existing;

  let clerkUser;
  try {
    clerkUser = await currentUser();
  } catch (error) {
    console.error("Clerk currentUser() failed while resolving session", error);
    return null;
  }
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  return linkClerkUser(clerkUserId, email);
}

export async function linkClerkUser(
  clerkUserId: string,
  email: string,
): Promise<SessionUser> {
  // ponytail: upsert-by-email on first login has a race if the same person
  // logs in twice concurrently before this resolves. Fine for MVP traffic;
  // if it becomes real, move this to a DB-level upsert with a unique
  // constraint conflict handler instead of find-then-branch.
  try {
    return await prisma.user.update({
      where: { email },
      data: { clerkUserId },
      include: sessionInclude,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return await prisma.user.create({
        data: { clerkUserId, email },
        include: sessionInclude,
      });
    }
    throw error;
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

export function residentApartmentIds(user: SessionUser, communityId: string): string[] {
  return user.residencies
    .filter((r) => r.communityId === communityId)
    .map((r) => r.apartmentId);
}
