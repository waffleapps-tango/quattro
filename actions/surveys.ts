"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { castVote } from "@/domain/surveys";
import { NotFoundError } from "@/domain/errors";

export async function voteSurvey(postId: string, optionId: string): Promise<{ ok: boolean; message?: string }> {
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: te("forbidden") };
  try {
    await castVote(actor, postId, optionId);
    revalidatePath("/posts");
    return { ok: true };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, message: te("forbidden") };
    console.error(error);
    return { ok: false, message: (await getTranslations("posts.survey"))("voteFailed") };
  }
}
