"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import * as posts from "@/domain/posts";
import { dispatchPending } from "@/domain/notifications/dispatch";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { PostKind } from "@/lib/generated/prisma";
import { endOfPinDay } from "@/lib/pin-date";

const postSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  kind: z.nativeEnum(PostKind).default(PostKind.NEIGHBOR),
  pinnedUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

type State = { message: string; success?: boolean };

async function failure(error: unknown, fallbackKey: "createFailed" | "updateFailed" | "deleteFailed"): Promise<State> {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  if (error instanceof UnauthorizedError || error instanceof NotFoundError) return { message: te("forbidden"), success: false };
  if (error instanceof ValidationError) return { message: te("invalidForm"), success: false };
  console.error(error);
  return { message: t(fallbackKey), success: false };
}

export async function createPost(_prev: State, formData: FormData): Promise<State> {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  const communityId = actor?.memberships[0]?.communityId; // ponytail: first membership, as on every page
  if (!actor || !communityId) return { message: te("forbidden"), success: false };
  const parsed = postSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    kind: formData.get("kind") ?? undefined,
    pinnedUntil: formData.get("pinnedUntil") ?? undefined,
  });
  if (!parsed.success) return { message: te("invalidForm"), success: false };
  try {
    await posts.createPost(actor, communityId, { ...parsed.data, pinnedUntil: endOfPinDay(parsed.data.pinnedUntil) });
    revalidatePath("/posts");
    after(() => dispatchPending().catch(console.error));
    return { message: t("created"), success: true };
  } catch (error) {
    return failure(error, "createFailed");
  }
}

export async function updatePost(_prev: State, formData: FormData): Promise<State> {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("forbidden"), success: false };
  const parsed = postSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    pinnedUntil: formData.get("pinnedUntil") ?? undefined,
  });
  if (!parsed.success) return { message: te("invalidForm"), success: false };
  try {
    const post = await posts.updatePost(actor, String(formData.get("id")), {
      title: parsed.data.title,
      content: parsed.data.content,
      // field absent (neighbor post form) → leave the pin alone
      pinnedUntil: formData.has("pinnedUntil") ? endOfPinDay(parsed.data.pinnedUntil) : undefined,
    });
    revalidatePath("/posts");
    revalidatePath(`/posts/${post.slug}`);
    return { message: t("updated"), success: true };
  } catch (error) {
    return failure(error, "updateFailed");
  }
}

export async function deletePost(postId: string): Promise<State> {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("forbidden"), success: false };
  try {
    await posts.deletePost(actor, postId);
    revalidatePath("/posts");
    return { message: t("deleted"), success: true };
  } catch (error) {
    return failure(error, "deleteFailed");
  }
}
