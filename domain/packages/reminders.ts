import prisma from "@/lib/prisma";
import { requireMembership, type SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { InvalidTransitionError, NotFoundError, RateLimitedError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { PackageStatus, type Prisma } from "@/lib/generated/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMIND_COOLDOWN_MS = 60 * 60 * 1000;

type PackageForNotice = {
  id: string;
  communityId: string;
  apartmentId: string;
  recipientUserId: string | null;
  receivedAt: Date;
  apartment: { number: string };
  building: { name: string };
};

export async function resolvePackageRecipients(
  tx: Prisma.TransactionClient,
  pkg: { apartmentId: string; recipientUserId: string | null },
): Promise<string[]> {
  if (pkg.recipientUserId) return [pkg.recipientUserId];
  const residents = await tx.apartmentResidency.findMany({
    where: { apartmentId: pkg.apartmentId },
    select: { userId: true },
  });
  return residents.map((r) => r.userId);
}

function reminderPayload(pkg: PackageForNotice, now: Date) {
  return {
    packageId: pkg.id,
    buildingName: pkg.building.name,
    apartmentNumber: pkg.apartment.number,
    daysWaiting: Math.max(0, Math.floor((now.getTime() - pkg.receivedAt.getTime()) / DAY_MS)),
  };
}

export async function remindPackage(actor: SessionUser, packageId: string, now = new Date()) {
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: { apartment: true, building: true },
  });
  if (!pkg) throw new NotFoundError(`Package ${packageId} not found`);

  requireMembership(actor, pkg.communityId, STAFF_ROLES);

  if (pkg.status === PackageStatus.PICKED_UP) {
    throw new InvalidTransitionError(`Package ${packageId} was already picked up`);
  }

  return prisma.$transaction(async (tx) => {
    // Serialize concurrent reminds of the same package so the cooldown check below is race-safe.
    await tx.$queryRaw`SELECT 1 FROM "Package" WHERE id = ${pkg.id} FOR UPDATE`;
    const recent = await tx.notification.findFirst({
      where: {
        communityId: pkg.communityId,
        type: "PACKAGE_REMINDER",
        createdAt: { gte: new Date(now.getTime() - REMIND_COOLDOWN_MS) },
        payload: { path: ["packageId"], equals: pkg.id },
      },
      select: { id: true },
    });
    if (recent) throw new RateLimitedError(`Package ${packageId} was reminded recently`);

    const recipientUserIds = await resolvePackageRecipients(tx, pkg);
    const created = await notify(tx, {
      communityId: pkg.communityId,
      type: "PACKAGE_REMINDER",
      recipientUserIds,
      payload: reminderPayload(pkg, now),
      // Race guard for double clicks; the findFirst above is the real cooldown.
      dedupeKey: `PACKAGE_REMINDER:${pkg.id}:${Math.floor(now.getTime() / REMIND_COOLDOWN_MS)}`,
    });

    await writeAuditLog(tx, {
      communityId: pkg.communityId,
      userId: actor.id,
      action: "PACKAGE_REMINDER_SENT",
      entity: "Package",
      entityId: pkg.id,
      metadata: { notified: created.length },
    });

    return { notified: created.length };
  });
}

export async function sendAutoReminders(now = new Date()) {
  const communities = await prisma.community.findMany({
    where: { reminderAfterDays: { not: null } },
    select: { id: true, reminderAfterDays: true },
  });

  let sent = 0;
  for (const community of communities) {
    try {
      const cutoff = new Date(now.getTime() - community.reminderAfterDays! * DAY_MS);
      // ponytail: rescans every overdue unpicked package on each run and relies on
      // the dedupe key to skip the ones already reminded; add a reminderSentAt
      // column on Package if the overdue set ever gets large.
      const overdue = await prisma.package.findMany({
        where: {
          communityId: community.id,
          status: { not: PackageStatus.PICKED_UP },
          receivedAt: { lte: cutoff },
        },
        include: { apartment: true, building: true },
      });

      for (const pkg of overdue) {
        await prisma.$transaction(async (tx) => {
          const created = await notify(tx, {
            communityId: community.id,
            type: "PACKAGE_REMINDER_AUTO",
            recipientUserIds: await resolvePackageRecipients(tx, pkg),
            payload: reminderPayload(pkg, now),
            dedupeKey: `PACKAGE_REMINDER_AUTO:${pkg.id}`,
          });
          sent += created.length;
        });
      }
    } catch (error) {
      console.error(`Auto reminders failed for community ${community.id}`, error);
    }
  }

  return { sent };
}
