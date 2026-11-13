"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { MAX_NAME_LENGTH, updateCommunityName } from "@/domain/communities/name";
import { UnauthorizedError, ValidationError } from "@/domain/errors";

type ActionState = { message: string; success: boolean };

const schema = z.object({ communityId: z.string().min(1), name: z.string().trim().min(1).max(MAX_NAME_LENGTH) });

export async function updateCommunityNameAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations("admin.communitySettings");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const parsed = schema.safeParse({ communityId: formData.get("communityId"), name: formData.get("name") });
  if (!parsed.success) return { message: t("invalid"), success: false };

  try {
    await updateCommunityName(actor, parsed.data.communityId, parsed.data.name);
    revalidatePath("/", "layout");
    return { message: t("saved"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof ValidationError) return { message: t("invalid"), success: false };
    console.error(error);
    return { message: t("failed"), success: false };
  }
}
