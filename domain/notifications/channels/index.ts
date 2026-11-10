import type { Prisma } from "@/lib/generated/prisma";
import { inAppChannel } from "./in-app";
import type { ChannelAdapter } from "./types";

// Register new channels (email, sms, push, ...) here.
export const channels: Record<string, ChannelAdapter> = {
  [inAppChannel.id]: inAppChannel,
};

// In-app is always included and cannot be opted out. Email / sms are added per the
// user's NotificationPreference (no row = both off).
// ponytail: preferences apply to every notification type; add a type parameter and a
// per-type table here if someone wants "SMS only for reminders".
export async function resolveChannelsByUser(
  tx: Prisma.TransactionClient,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const prefs = await tx.notificationPreference.findMany({ where: { userId: { in: userIds } } });
  const byUser = new Map(prefs.map((p) => [p.userId, p]));
  return new Map(
    userIds.map((id) => {
      const p = byUser.get(id);
      const ids: string[] = [inAppChannel.id];
      if (p?.emailEnabled) ids.push("email");
      if (p?.smsEnabled && p.phone) ids.push("sms");
      return [id, ids];
    }),
  );
}
