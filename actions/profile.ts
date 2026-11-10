"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { setShareName } from "@/domain/profile";

type ActionState = { message: string; success: boolean };

export async function setShareNameAction(share: boolean): Promise<ActionState> {
  const t = await getTranslations("profile.privacy");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await setShareName(actor, share);
    // Names appear on packages, reports and profile pages for other viewers.
    revalidatePath("/", "layout");
    return { message: t("saved"), success: true };
  } catch (error) {
    console.error(error);
    return { message: t("failed"), success: false };
  }
}
