"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, type SessionUser } from "@/auth/session";
import * as engagement from "@/domain/engagement";
import { dispatchPending } from "@/domain/notifications/dispatch";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { parseReactionKind, type ReactionSummary } from "@/lib/engagement";

const idSchema = z.string().min(1).max(64);
const targetSchema = z.object({ type: z.enum(["post", "report"]), id: z.string().min(1).max(64) });
type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function run<T>(rawTarget: unknown, fn: (actor: SessionUser, t: engagement.Target) => Promise<T>, revalidate = true, invalidKey: "invalidReaction" | "invalidRequest" = "invalidRequest"): Promise<Result<T>> {
  const t = await getTranslations("engagement.errors");
  const actor = await getCurrentUser();
  const target = targetSchema.safeParse(rawTarget);
  if (!actor || !target.success) return { ok: false, message: t("notFound") };
  try {
    const data = await fn(actor, target.data);
    if (revalidate) revalidatePath(target.data.type === "post" ? "/posts" : "/reports");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, message: t("notFound") };
    if (error instanceof UnauthorizedError) return { ok: false, message: t("forbidden") };
    if (error instanceof ValidationError) return { ok: false, message: t(error.message.startsWith("comment must") ? "invalid" : invalidKey) };
    console.error(error);
    return { ok: false, message: t("generic") };
  }
}

export async function setReactionAction(target: unknown, kind: unknown): Promise<Result<ReactionSummary>> {
  const k = parseReactionKind(kind);
  if (k === "invalid") return { ok: false, message: (await getTranslations("engagement.errors"))("invalidReaction") };
  return run(target, (actor, t) => engagement.setReaction(actor, t, k), true, "invalidReaction");
}

export async function listCommentsAction(target: unknown) {
  return run(target, (actor, t) => engagement.listComments(actor, t), false);
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

export async function addCommentAction(target: unknown, body: unknown, parentId?: unknown) {
  const parent = idSchema.optional().safeParse(parentId ?? undefined);
  if (!parent.success) return { ok: false as const, message: (await getTranslations("engagement.errors"))("invalidRequest") };
  const res = await run(target, (actor, t) => engagement.addComment(actor, t, { body: text(body), parentId: parent.data }));
  if (res.ok) after(() => dispatchPending().catch(console.error));
  return res;
}

export async function editCommentAction(target: unknown, commentId: unknown, body: unknown) {
  const id = idSchema.safeParse(commentId);
  if (!id.success) return { ok: false as const, message: (await getTranslations("engagement.errors"))("notFound") };
  return run(target, (actor, t) => engagement.editComment(actor, t, id.data, text(body)));
}

export async function deleteCommentAction(target: unknown, commentId: unknown) {
  const id = idSchema.safeParse(commentId);
  if (!id.success) return { ok: false as const, message: (await getTranslations("engagement.errors"))("notFound") };
  return run(target, (actor, t) => engagement.deleteComment(actor, t, id.data));
}
