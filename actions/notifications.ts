"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/session";
import { markAllRead, markRead } from "@/domain/notifications/queries";
import { updateReminderAfterDays } from "@/domain/notifications/settings";
import { UnauthorizedError, ValidationError } from "@/domain/errors";

type ActionState = { message: string; success: boolean };

export async function markNotificationReadAction(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markRead(user, id);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  const membership = user?.memberships[0];
  if (!user || !membership) return;
  await markAllRead(user, membership.communityId);
}

const settingsSchema = z.object({
  communityId: z.string().min(1),
  enabled: z.boolean(),
  days: z.coerce.number(),
});

export async function updateReminderSettingsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("packages.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const validated = settingsSchema.safeParse({
    communityId: formData.get("communityId"),
    enabled: formData.get("enabled") === "on",
    days: formData.get("days") || 0,
  });
  if (!validated.success) return { message: t("settingsInvalid"), success: false };

  try {
    await updateReminderAfterDays(
      actor,
      validated.data.communityId,
      validated.data.enabled ? validated.data.days : null,
    );
    revalidatePath("/packages");
    return { message: t("settingsSaved"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: t("settingsNoPermission"), success: false };
    }
    if (error instanceof ValidationError) {
      return { message: t("settingsInvalid"), success: false };
    }
    console.error(error);
    return { message: t("settingsFailed"), success: false };
  }
}
