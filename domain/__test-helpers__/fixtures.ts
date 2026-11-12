import prisma from "@/lib/prisma";
import { Role, type ResidencyKind } from "@/lib/generated/prisma";
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
  kind?: ResidencyKind;
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
      role: params.role,
    },
  });
  const residencies = params.apartmentId
    ? [
        await prisma.apartmentResidency.create({
          data: { userId: user.id, apartmentId: params.apartmentId, communityId: params.communityId, kind: params.kind ?? "OWNER" },
        }),
      ]
    : [];
  return { ...user, memberships: [membership], residencies };
}

export async function cleanupDatabase() {
  await prisma.reaction.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.infoContact.deleteMany();
  await prisma.infoSection.deleteMany();
  await prisma.apartmentResidency.deleteMany();
  await prisma.notificationDelivery.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.report.deleteMany();
  await prisma.parkingSpace.deleteMany();
  await prisma.storageUnit.deleteMany();
  await prisma.package.deleteMany();
  await prisma.post.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.apartment.deleteMany();
  await prisma.building.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();
}

export async function createPackageScenario() {
  const { community, building, apartment } =
    await createCommunityWithBuildingAndApartment();
  const receptionist = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    role: Role.RECEPTIONIST,
  });
  const resident = await createUserWithMembership({
    communityId: community.id,
    buildingId: building.id,
    apartmentId: apartment.id,
    role: Role.RESIDENT,
  });
  return { community, building, apartment, receptionist, resident };
}
