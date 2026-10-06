import prisma from "@/lib/prisma";
import { Role, PackageStatus } from "@/lib/generated/prisma";

async function main() {
  const community = await prisma.community.create({
    data: { name: "Osiedle Kwiatowe", address: "ul. Kwiatowa 1" },
  });

  const buildings = await Promise.all(
    ["A", "B", "C", "D"].map((letter) =>
      prisma.building.create({
        data: { communityId: community.id, name: `Budynek ${letter}` },
      }),
    ),
  );

  const apartmentsByBuilding = await Promise.all(
    buildings.map((building) =>
      Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          prisma.apartment.create({
            data: { buildingId: building.id, number: `${i + 1}`, floor: Math.ceil((i + 1) / 2) },
          }),
        ),
      ),
    ),
  );

  const admin = await prisma.user.create({
    data: { clerkUserId: "pending:admin@quattro.dev", email: "admin@quattro.dev", firstName: "Anna", lastName: "Admin" },
  });
  await prisma.membership.create({
    data: { userId: admin.id, communityId: community.id, role: Role.ADMIN },
  });

  const manager = await prisma.user.create({
    data: { clerkUserId: "pending:manager@quattro.dev", email: "manager@quattro.dev", firstName: "Marek", lastName: "Manager" },
  });
  await prisma.membership.create({
    data: { userId: manager.id, communityId: community.id, role: Role.MANAGER },
  });

  const receptionist = await prisma.user.create({
    data: { clerkUserId: "pending:reception@quattro.dev", email: "reception@quattro.dev", firstName: "Renata", lastName: "Recepcja" },
  });
  await prisma.membership.create({
    data: {
      userId: receptionist.id,
      communityId: community.id,
      buildingId: buildings[0].id,
      role: Role.RECEPTIONIST,
    },
  });

  const residents = await Promise.all(
    [0, 1, 2].map((i) =>
      prisma.user.create({
        data: {
          clerkUserId: `pending:resident${i + 1}@quattro.dev`,
          email: `resident${i + 1}@quattro.dev`,
          firstName: `Resident`,
          lastName: `${i + 1}`,
        },
      }),
    ),
  );

  await Promise.all(
    residents.map((resident, i) =>
      prisma.membership.create({
        data: {
          userId: resident.id,
          communityId: community.id,
          buildingId: buildings[0].id,
          apartmentId: apartmentsByBuilding[0][i].id,
          role: Role.RESIDENT,
        },
      }),
    ),
  );

  await prisma.package.create({
    data: {
      communityId: community.id,
      buildingId: buildings[0].id,
      apartmentId: apartmentsByBuilding[0][0].id,
      recipientUserId: residents[0].id,
      trackingNumber: "TRK1001",
      courier: "DPD",
      status: PackageStatus.RECEIVED,
      receivedById: receptionist.id,
    },
  });

  await prisma.package.create({
    data: {
      communityId: community.id,
      buildingId: buildings[0].id,
      apartmentId: apartmentsByBuilding[0][1].id,
      recipientUserId: residents[1].id,
      trackingNumber: "TRK1002",
      courier: "InPost",
      status: PackageStatus.PICKED_UP,
      receivedById: receptionist.id,
      pickedUpById: receptionist.id,
      pickedUpAt: new Date(),
    },
  });

  console.log(`Seeded community ${community.id} with ${buildings.length} buildings.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
