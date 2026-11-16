// DEV ONLY (local DB): swaps in worst-case-but-plausible values. Revert with `--revert`.
// Limits used come from the schemas: community name 60, post title 200, report title 120, email 254.
import "dotenv/config";
import prisma from "../lib/prisma";

const NAME = "Osiedle Mieszkaniowe im. Gen. Władysława Sikorskiego II";
const LONG_EMAIL = "bartholomew.fitzgerald-wisniewska@northwind-industries-holdings.example.com";
const POST = "Zebranie wspólnoty mieszkaniowej w sprawie remontu elewacji, wymiany wind oraz zmiany zarządcy nieruchomości — prosimy o liczny udział wszystkich właścicieli lokali";

async function main() {
  const revert = process.argv.includes("--revert");
  const c = await prisma.community.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  await prisma.community.update({ where: { id: c.id }, data: { name: revert ? "Osiedle Kwiatowe" : NAME } });
  const u = await prisma.user.findFirstOrThrow({ where: { email: "resident1+clerk_test@quattro.dev" } });
  await prisma.user.update({
    where: { id: u.id },
    data: revert
      ? { firstName: "Resident", lastName: "1" }
      : { firstName: "Aleksandra", lastName: "Wiśniewska-Kowalczyk" },
  });
  const a = await prisma.user.findFirstOrThrow({ where: { email: "admin+clerk_test@quattro.dev" } });
  await prisma.user.update({
    where: { id: a.id },
    data: revert ? { firstName: "Anna", lastName: "Admin" } : { firstName: "Jo", lastName: null },
  });
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: "worst-" } } });
  if (!revert) {
    const mk = (i: number, type: string, payload: object) => ({
      communityId: c.id, recipientUserId: a.id, type, payload, dedupeKey: `worst-${i}`,
    });
    await prisma.notification.createMany({
      data: [
        mk(1, "POST_ANNOUNCEMENT", { postId: "x", slug: "x", title: POST }),
        mk(2, "PACKAGE_RECEIVED", { packageId: "x", buildingName: "Budynek A — klatka schodowa północna", apartmentNumber: "1204/B" }),
        mk(3, "JOIN_REQUEST_CREATED", { requestId: "x", name: LONG_EMAIL, buildingName: "A", apartmentNumber: "1" }),
        ...[4, 5, 6, 7, 8, 9, 10, 11].map((i) => mk(i, "PACKAGE_RECEIVED", { packageId: "x", buildingName: "Budynek A", apartmentNumber: String(i) })),
      ],
    });
  }
}
main().finally(() => prisma.$disconnect());
