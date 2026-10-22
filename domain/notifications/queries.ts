import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";

export function listNotifications(actor: SessionUser, communityId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { recipientUserId: actor.id, communityId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export function countUnread(actor: SessionUser, communityId: string) {
  return prisma.notification.count({
    where: { recipientUserId: actor.id, communityId, readAt: null },
  });
}

export async function markRead(actor: SessionUser, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientUserId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(actor: SessionUser, communityId: string) {
  await prisma.notification.updateMany({
    where: { recipientUserId: actor.id, communityId, readAt: null },
    data: { readAt: new Date() },
  });
}
