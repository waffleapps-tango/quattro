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
          role: Role.RESIDENT,
        },
      }),
    ),
  );

  await Promise.all(
    residents.map((resident, i) =>
      prisma.apartmentResidency.create({
        data: {
          kind: "OWNER",
          userId: resident.id,
          apartmentId: apartmentsByBuilding[0][i].id,
          communityId: community.id,
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

  // Parking spaces and storage units for building A's apartments; one shared space.
  await Promise.all(
    apartmentsByBuilding[0].slice(0, 3).flatMap((apartment, i) => [
      prisma.parkingSpace.create({
        data: {
          communityId: community.id,
          buildingId: buildings[0].id,
          apartmentId: apartment.id,
          number: `P-${i + 1}`,
          level: "-1",
          hasEvCharger: i === 1,
        },
      }),
      prisma.storageUnit.create({
        data: {
          communityId: community.id,
          buildingId: buildings[0].id,
          apartmentId: apartment.id,
          number: `K-${i + 1}`,
        },
      }),
    ]),
  );
  await prisma.parkingSpace.create({
    data: { communityId: community.id, number: "P-S1", level: "naziemny" },
  });

  await prisma.report.createMany({
    data: [
      {
        communityId: community.id,
        authorId: residents[0].id,
        category: "technical",
        type: "DEFECT",
        visibility: "PUBLIC",
        title: "Awaria windy",
        description: "Winda w budynku A stoi na 3 piętrze.",
        urgent: true,
      },
      {
        communityId: community.id,
        authorId: residents[1].id,
        category: "ideas",
        type: "IDEA",
        visibility: "PUBLIC",
        title: "Stojaki rowerowe",
        description: "Przydałyby się stojaki przed budynkiem B.",
      },
      {
        communityId: community.id,
        buildingId: buildings[0].id,
        apartmentId: apartmentsByBuilding[0][0].id,
        authorId: residents[0].id,
        category: "own-apartment",
        type: "DEFECT",
        visibility: "PRIVATE",
        title: "Wilgoć lub zacieki na ścianach",
        description: "Zacieki w łazience przy suficie.",
      },
    ],
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
