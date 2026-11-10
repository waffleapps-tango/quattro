import type { Prisma } from "@/lib/generated/prisma";
import { channels, resolveChannelsByUser } from "./channels";
import { NOTIFICATION_TYPES, type NotificationPayload, type NotificationType } from "./types";

export async function notify<T extends NotificationType>(
  tx: Prisma.TransactionClient,
  params: {
    communityId: string;
    type: T;
    recipientUserIds: string[];
    payload: NotificationPayload<T>;
    dedupeKey?: string;
  },
) {
  const payload = NOTIFICATION_TYPES[params.type].parse(params.payload);
  const recipientIds = [...new Set(params.recipientUserIds)];
  if (recipientIds.length === 0) return [];

  // skipDuplicates (ON CONFLICT DO NOTHING) keeps dedupe race-free without
  // aborting the surrounding transaction; only new rows are returned.
  const created = await tx.notification.createManyAndReturn({
    data: recipientIds.map((recipientUserId) => ({
      communityId: params.communityId,
      recipientUserId,
      type: params.type,
      payload: payload as Prisma.InputJsonValue,
      dedupeKey: params.dedupeKey,
    })),
    skipDuplicates: true,
  });

  const now = new Date();
  const channelsByUser = await resolveChannelsByUser(tx, recipientIds);
  await tx.notificationDelivery.createMany({
    data: created.flatMap((notification) =>
      channelsByUser.get(notification.recipientUserId)!.map((channel) => {
        const instant = channels[channel]?.instant === true;
        return {
          notificationId: notification.id,
          channel,
          status: instant ? ("SENT" as const) : ("PENDING" as const),
          sentAt: instant ? now : null,
        };
      }),
    ),
  });

  return created;
}
