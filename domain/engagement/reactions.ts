import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { ValidationError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { NOTIFICATION_TYPES } from "@/domain/notifications/types";
import type { Prisma } from "@/lib/generated/prisma";
import type { ReactionKindName, ReactionSummary } from "@/lib/engagement";
import {
  resolveTarget,
  targetWhere,
  type ResolvedTarget,
  type Target,
} from "./targets";

export async function reactionSummary(
  actor: SessionUser,
  t: Target,
): Promise<ReactionSummary> {
  const rows = await prisma.reaction.findMany({
    where: targetWhere(t),
    select: { userId: true, kind: true },
  });
  const counts: ReactionSummary["counts"] = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return {
    counts,
    total: rows.length,
    mine: rows.find((r) => r.userId === actor.id)?.kind ?? null,
  };
}

async function notifyReactions(
  tx: Prisma.TransactionClient,
  target: ResolvedTarget,
  t: Target,
) {
  if (!target.authorId) return;
  const count = await tx.reaction.count({
    where: { ...targetWhere(t), userId: { not: target.authorId } },
  });
  const payload = NOTIFICATION_TYPES.REACTIONS_ADDED.parse({
    targetType: t.type,
    targetId: t.id,
    title: target.title,
    slug: target.slug,
    count,
  });
  const dedupeKey = `REACTIONS:${t.type}:${t.id}`;
  const existing = await tx.notification.findUnique({
    where: {
      recipientUserId_dedupeKey: {
        recipientUserId: target.authorId,
        dedupeKey,
      },
    },
  });
  if (existing) {
    await tx.notification.update({
      where: { id: existing.id },
      data: { payload, readAt: null, createdAt: new Date() },
    });
  } else {
    await notify(tx, {
      communityId: target.communityId,
      type: "REACTIONS_ADDED",
      recipientUserIds: [target.authorId],
      payload,
      dedupeKey,
    });
  }
}

// kind === the current reaction (or null) removes it; another kind switches; none yet creates.
export async function setReaction(
  actor: SessionUser,
  t: Target,
  kind: ReactionKindName | null,
): Promise<ReactionSummary> {
  const target = await resolveTarget(actor, t);
  if (target.isPrivate)
    throw new ValidationError("Private reports take no reactions");
  const where =
    t.type === "post"
      ? { userId_postId: { userId: actor.id, postId: t.id } }
      : { userId_reportId: { userId: actor.id, reportId: t.id } };

  const run = () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.reaction.findUnique({ where });
      if (kind === null || existing?.kind === kind) {
        if (existing) await tx.reaction.delete({ where: { id: existing.id } });
      } else if (existing) {
        await tx.reaction.update({
          where: { id: existing.id },
          data: { kind },
        });
      } else {
        await tx.reaction.create({
          data: { userId: actor.id, kind, ...targetWhere(t) },
        });
        if (target.authorId !== actor.id) await notifyReactions(tx, target, t);
      }
    });
  // Concurrent first reactions (double-click, two tabs) race on the unique; retry once and it sees the row.
  try {
    await run();
  } catch (e) {
    // Structural check: instanceof breaks when Next loads Prisma twice (see auth/session.ts).
    if ((e as { code?: unknown })?.code !== "P2002") throw e;
    await run();
  }
  return reactionSummary(actor, t);
}
