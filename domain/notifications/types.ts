import { z } from "zod";

const packagePayload = z.object({
  packageId: z.string(),
  buildingName: z.string(),
  apartmentNumber: z.string(),
});

const reminderPayload = packagePayload.extend({
  daysWaiting: z.number().int().min(0),
});

const reportStatusPayload = z.object({
  reportId: z.string(),
  title: z.string(),
  status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED", "APPROVED", "REJECTED", "CLOSED"]),
});

// One entry per notification type. Message text lives in messages/*.json under
// notifications.types.<TYPE>.{title,body}.
export const NOTIFICATION_TYPES = {
  PACKAGE_RECEIVED: packagePayload,
  PACKAGE_REMINDER: reminderPayload,
  PACKAGE_REMINDER_AUTO: reminderPayload,
  REPORT_STATUS_CHANGED: reportStatusPayload,
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export type NotificationPayload<T extends NotificationType> = z.infer<
  (typeof NOTIFICATION_TYPES)[T]
>;
