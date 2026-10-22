import { z } from "zod";

const packagePayload = z.object({
  packageId: z.string(),
  buildingName: z.string(),
  apartmentNumber: z.string(),
});

const reminderPayload = packagePayload.extend({
  daysWaiting: z.number().int().min(0),
});

// One entry per notification type. Message text lives in messages/*.json under
// notifications.types.<TYPE>.{title,body}.
export const NOTIFICATION_TYPES = {
  PACKAGE_RECEIVED: packagePayload,
  PACKAGE_REMINDER: reminderPayload,
  PACKAGE_REMINDER_AUTO: reminderPayload,
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export type NotificationPayload<T extends NotificationType> = z.infer<
  (typeof NOTIFICATION_TYPES)[T]
>;
