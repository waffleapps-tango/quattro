"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import {
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import { addTenant } from "@/domain/residencies";
import { setPrimaryContact, updateResidencyPrefs } from "@/domain/residencies/prefs";

type ActionState = { message: string; success: boolean };

const addTenantSchema = z.object({
  apartmentId: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
});

export async function addTenantAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("profile.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const validated = addTenantSchema.safeParse({
    apartmentId: formData.get("apartmentId"),
    email: formData.get("email"),
  });
  if (!validated.success) return { message: t("invalidEmail"), success: false };

  try {
    await addTenant(actor, validated.data);
    revalidatePath("/profile");
    return { message: t("tenantAdded"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof ValidationError) return { message: t("alreadyLinked"), success: false };
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    console.error(error);
    return { message: t("tenantFailed"), success: false };
  }
}

export async function updateResidencyPrefsAction(
  residencyId: string,
  prefs: { receivesPackages?: boolean; livesHereOverride?: boolean | null },
): Promise<ActionState> {
  const t = await getTranslations("profile.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await updateResidencyPrefs(actor, residencyId, prefs);
    revalidatePath("/profile");
    return { message: t("prefsSaved"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    if (!(error instanceof ValidationError)) console.error(error);
    return { message: t("prefsFailed"), success: false };
  }
}

export async function setPrimaryContactAction(
  apartmentId: string,
  residencyId: string | null,
): Promise<ActionState> {
  const t = await getTranslations("profile.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await setPrimaryContact(actor, apartmentId, residencyId);
    revalidatePath("/profile");
    return { message: t("primarySet"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    if (error instanceof TenantMismatchError || error instanceof ValidationError) {
      return { message: t("primaryInvalid"), success: false };
    }
    console.error(error);
    return { message: t("primaryFailed"), success: false };
  }
}
