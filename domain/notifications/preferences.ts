import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { ValidationError } from "@/domain/errors";

export type NotificationPreferences = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  phone: string | null;
};

const E164 = /^\+[1-9]\d{7,14}$/;
const DEFAULTS: NotificationPreferences = { emailEnabled: false, smsEnabled: false, phone: null };

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!row) return DEFAULTS;
  return { emailEnabled: row.emailEnabled, smsEnabled: row.smsEnabled, phone: row.phone };
}

// A user may only change their own preferences, so there is no role check.
export async function updatePreferences(actor: SessionUser, input: NotificationPreferences) {
  const stripped = input.phone?.replace(/[\s-]/g, "") ?? "";
  const phone = stripped === "" ? null : stripped;
  if (phone !== null && !E164.test(phone)) {
    throw new ValidationError("phone must be in E.164 format, e.g. +48123456789");
  }
  if (input.smsEnabled && phone === null) {
    throw new ValidationError("smsEnabled requires a phone number");
  }
  const data = { emailEnabled: input.emailEnabled, smsEnabled: input.smsEnabled, phone };
  await prisma.notificationPreference.upsert({
    where: { userId: actor.id },
    create: { userId: actor.id, ...data },
    update: data,
  });
}
