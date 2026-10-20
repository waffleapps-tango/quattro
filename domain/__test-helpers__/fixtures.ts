import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";

export async function createCommunityWithBuildingAndApartment() {
  const community = await prisma.community.create({
    data: { name: `Test Community ${Date.now()}` },
  });
  const building = await prisma.building.create({
    data: { communityId: community.id, name: "Building A" },
  });
  const apartment = await prisma.apartment.create({
    data: { buildingId: building.id, number: "101" },
  });
  return { community, building, apartment };
}

export async function createUserWithMembership(params: {
  communityId: string;
  buildingId?: string;
  apartmentId?: string;
  role: Role;
  email?: string;
}): Promise<SessionUser> {
  const email = params.email ?? `user-${Date.now()}-${Math.random()}@example.com`;
  const user = await prisma.user.create({
    data: { clerkUserId: `clerk_${email}`, email },
  });
  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      communityId: params.communityId,
      buildingId: params.buildingId,
      apartmentId: params.apartmentId,
      role: params.role,
    },
  });
  return { ...user, memberships: [membership] };
}

export async function cleanupDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.report.deleteMany();
  await prisma.parkingSpace.deleteMany();
  await prisma.storageUnit.deleteMany();
  await prisma.package.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.apartment.deleteMany();
  await prisma.building.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();
}
