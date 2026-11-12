"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, type SessionUser } from "@/auth/session";
import * as engagement from "@/domain/engagement";
import { dispatchPending } from "@/domain/notifications/dispatch";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { REACTION_KINDS, type ReactionKindName, type ReactionSummary } from "@/lib/engagement";

const targetSchema = z.object({ type: z.enum(["post", "report"]), id: z.string().min(1).max(64) });
type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function run<T>(rawTarget: unknown, fn: (actor: SessionUser, t: engagement.Target) => Promise<T>): Promise<Result<T>> {
  const t = await getTranslations("engagement.errors");
  const actor = await getCurrentUser();
  const target = targetSchema.safeParse(rawTarget);
  if (!actor || !target.success) return { ok: false, message: t("notFound") };
  try {
    const data = await fn(actor, target.data);
    revalidatePath(target.data.type === "post" ? "/posts" : "/reports");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, message: t("notFound") };
    if (error instanceof UnauthorizedError) return { ok: false, message: t("forbidden") };
    if (error instanceof ValidationError) return { ok: false, message: t("invalid") };
    console.error(error);
    return { ok: false, message: t("generic") };
  }
}

export async function setReactionAction(target: unknown, kind: ReactionKindName | null): Promise<Result<ReactionSummary>> {
  const k = kind === null || REACTION_KINDS.includes(kind) ? kind : null;
  return run(target, (actor, t) => engagement.setReaction(actor, t, k));
}

export async function listCommentsAction(target: unknown) {
  return run(target, (actor, t) => engagement.listComments(actor, t));
}

export async function addCommentAction(target: unknown, body: string, parentId?: string) {
  const res = await run(target, (actor, t) => engagement.addComment(actor, t, { body: String(body), parentId }));
  if (res.ok) after(() => dispatchPending().catch(console.error));
  return res;
}

export async function editCommentAction(target: unknown, commentId: string, body: string) {
  return run(target, (actor, t) => engagement.editComment(actor, t, String(commentId), String(body)));
}

export async function deleteCommentAction(target: unknown, commentId: string) {
  return run(target, (actor, t) => engagement.deleteComment(actor, t, String(commentId)));
}
