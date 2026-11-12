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

const postAnnouncementPayload = z.object({
  postId: z.string(),
  slug: z.string(),
  title: z.string(),
});

const targetPayload = z.object({
  targetType: z.enum(["post", "report"]),
  targetId: z.string(),
  title: z.string(),
  slug: z.string(),
});

// One entry per notification type. Message text lives in messages/*.json under
// notifications.types.<TYPE>.{title,body}.
export const NOTIFICATION_TYPES = {
  PACKAGE_RECEIVED: packagePayload,
  PACKAGE_REMINDER: reminderPayload,
  PACKAGE_REMINDER_AUTO: reminderPayload,
  REPORT_STATUS_CHANGED: reportStatusPayload,
  POST_ANNOUNCEMENT: postAnnouncementPayload,
  COMMENT_ADDED: targetPayload.extend({ kind: z.enum(["comment", "reply"]) }),
  REACTIONS_ADDED: targetPayload.extend({ count: z.number().int().min(1) }),
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export type NotificationPayload<T extends NotificationType> = z.infer<
  (typeof NOTIFICATION_TYPES)[T]
>;

// Types that only ever go to the in-app inbox (never email/SMS), whatever the user's preferences.
export const IN_APP_ONLY: ReadonlySet<NotificationType> = new Set<NotificationType>(["REACTIONS_ADDED"]);
