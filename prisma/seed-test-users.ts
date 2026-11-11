// Additive + idempotent: adds Clerk test-email users to the existing dev community without
// touching other data. Run: npm run db:seed:test-users:gcp
// Log in at /sign-in with the email and verification code 424242 (Clerk dev instance only).
import prisma from "@/lib/prisma";
import { Role, type ResidencyKind } from "@/lib/generated/prisma";

type T = { key: string; first: string; last: string; role?: Role; apt?: number; kind?: ResidencyKind; building?: boolean };
const USERS: T[] = [
  { key: "admin", first: "Anna", last: "Admin", role: Role.ADMIN },
  { key: "manager", first: "Marek", last: "Manager", role: Role.MANAGER },
  { key: "reception", first: "Renata", last: "Recepcja", role: Role.RECEPTIONIST, building: true },
  { key: "resident1", first: "Resident", last: "1", role: Role.RESIDENT, apt: 1, kind: "OWNER", building: true },
  { key: "resident2", first: "Resident", last: "2", role: Role.RESIDENT, apt: 2, kind: "OWNER", building: true },
  { key: "resident3", first: "Resident", last: "3", role: Role.RESIDENT, apt: 3, kind: "OWNER", building: true },
  { key: "tenant1", first: "Tenant", last: "1", role: Role.RESIDENT, apt: 1, kind: "TENANT", building: true },
  { key: "waiting", first: "Waldek", last: "Oczekujący" }, // no membership: waiting screen
];

async function main() {
  const community = await prisma.community.findFirstOrThrow({ where: { name: "Osiedle Kwiatowe" } });
  const building = await prisma.building.findFirstOrThrow({ where: { communityId: community.id, name: "Budynek A" } });
  for (const u of USERS) {
    const email = `${u.key}+clerk_test@quattro.dev`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, clerkUserId: `pending:${email}`, firstName: u.first, lastName: u.last },
    });
    if (!u.role) continue;
    await prisma.membership.upsert({
      where: { userId_communityId: { userId: user.id, communityId: community.id } },
      update: { role: u.role },
      create: { userId: user.id, communityId: community.id, role: u.role, buildingId: u.building ? building.id : null },
    });
    if (u.apt && u.kind) {
      const apartment = await prisma.apartment.findFirstOrThrow({ where: { buildingId: building.id, number: String(u.apt) } });
      await prisma.apartmentResidency.upsert({
        where: { userId_apartmentId: { userId: user.id, apartmentId: apartment.id } },
        update: {},
        create: { userId: user.id, apartmentId: apartment.id, communityId: community.id, kind: u.kind },
      });
    }
    console.log("ok", email, u.role ?? "(no membership)");
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
