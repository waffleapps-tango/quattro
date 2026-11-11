// One-off: removes the old `<key>@quattro.dev` seed users that duplicate the
// `<key>+clerk_test@quattro.dev` test accounts. Their packages, reports and audit
// entries are re-pointed to the matching test account, everything else of theirs
// (memberships, residencies, notifications) is deleted. Dry run unless --apply.
// Run: npx dotenv -e .env.gcp -- tsx prisma/scripts/remove-legacy-seed-users.ts [--apply]
import prisma from "@/lib/prisma";
import type { User } from "@/lib/generated/prisma";

const KEYS = ["admin", "manager", "reception", "resident1", "resident2", "resident3", "tenant1"];
const apply = process.argv.includes("--apply");

async function main() {
  const pairs: { legacy: User; target: User }[] = [];
  for (const key of KEYS) {
    const legacy = await prisma.user.findUnique({ where: { email: `${key}@quattro.dev` } });
    if (!legacy) continue;
    const target = await prisma.user.findUnique({ where: { email: `${key}+clerk_test@quattro.dev` } });
    if (!target) throw new Error(`No ${key}+clerk_test@quattro.dev to take over ${legacy.email}`);
    if (!legacy.clerkUserId.startsWith("pending:")) throw new Error(`${legacy.email} has signed in; refusing`);
    pairs.push({ legacy, target });
  }

  for (const { legacy, target } of pairs) {
    const id = legacy.id;
    const counts = {
      received: await prisma.package.count({ where: { receivedById: id } }),
      pickedUp: await prisma.package.count({ where: { pickedUpById: id } }),
      recipient: await prisma.package.count({ where: { recipientUserId: id } }),
      reports: await prisma.report.count({ where: { authorId: id } }),
      audit: await prisma.auditLog.count({ where: { userId: id } }),
      notifications: await prisma.notification.count({ where: { recipientUserId: id } }),
      memberships: await prisma.membership.count({ where: { userId: id } }),
      residencies: await prisma.apartmentResidency.count({ where: { userId: id } }),
    };
    console.log(`${legacy.email} -> ${target.email}`, counts);
  }
  if (!apply) return console.log(pairs.length ? "Dry run. Re-run with --apply." : "Nothing to remove.");

  await prisma.$transaction(async (tx) => {
    for (const { legacy, target } of pairs) {
      const from = legacy.id;
      const to = target.id;
      await tx.package.updateMany({ where: { receivedById: from }, data: { receivedById: to } });
      await tx.package.updateMany({ where: { pickedUpById: from }, data: { pickedUpById: to } });
      await tx.package.updateMany({ where: { recipientUserId: from }, data: { recipientUserId: to } });
      await tx.report.updateMany({ where: { authorId: from }, data: { authorId: to } });
      await tx.auditLog.updateMany({ where: { userId: from }, data: { userId: to } });
      await tx.notification.deleteMany({ where: { recipientUserId: from } });
      await tx.apartmentResidency.deleteMany({ where: { userId: from } });
      await tx.membership.deleteMany({ where: { userId: from } });
      await tx.user.delete({ where: { id: from } });
    }
  });
  console.log(`Removed ${pairs.length} legacy users.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
