import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { STAFF_ROLES } from "@/domain/packages/roles";
import type { ReactionSummary } from "@/lib/engagement";
import { commentAuthorSelect, toCommentView, type CommentView } from "./comments";
import { targetKey, type Target } from "./targets";

export type EngagementSummary = ReactionSummary & { commentCount: number; preview: CommentView[] };
export const EMPTY_ENGAGEMENT: EngagementSummary = { counts: {}, total: 0, mine: null, commentCount: 0, preview: [] };

// One page of cards → two queries. Callers pass targets they already listed for this actor.
// ponytail: loads every reaction row and live comment of the page; switch to groupBy + a window
// query if a single page ever carries thousands of them.
export async function engagementSummary(
  actor: SessionUser,
  communityId: string,
  targets: Target[],
): Promise<Record<string, EngagementSummary>> {
  if (targets.length === 0) return {};
  const postIds = targets.filter((t) => t.type === "post").map((t) => t.id);
  const reportIds = targets.filter((t) => t.type === "report").map((t) => t.id);
  const or = [
    ...(postIds.length ? [{ postId: { in: postIds } }] : []),
    ...(reportIds.length ? [{ reportId: { in: reportIds } }] : []),
  ];
  const [reactions, comments, reports] = await Promise.all([
    prisma.reaction.findMany({ where: { OR: or }, select: { userId: true, postId: true, reportId: true, kind: true } }),
    prisma.comment.findMany({
      where: { OR: or, deletedAt: null },
      include: { author: { select: commentAuthorSelect } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    reportIds.length
      ? prisma.report.findMany({ where: { id: { in: reportIds } }, select: { id: true, authorId: true } })
      : [],
  ]);
  const reporterOf = new Map(reports.map((r) => [r.id, r.authorId]));
  // Staff differs per target type: posts MANAGER/ADMIN, reports STAFF_ROLES.
  const role = actor.memberships.find((m) => m.communityId === communityId)?.role;
  const has = (roles: string[]) => !!role && roles.includes(role);
  const postStaff = has(["MANAGER", "ADMIN"]);
  const reportStaff = has(STAFF_ROLES);
  const keyOf = (r: { postId: string | null; reportId: string | null }) =>
    r.postId ? `post:${r.postId}` : `report:${r.reportId}`;

  const out: Record<string, EngagementSummary> = {};
  for (const t of targets) out[targetKey(t)] = { counts: {}, total: 0, mine: null, commentCount: 0, preview: [] };
  for (const r of reactions) {
    const s = out[keyOf(r)];
    s.counts[r.kind] = (s.counts[r.kind] ?? 0) + 1;
    s.total++;
    if (r.userId === actor.id) s.mine = r.kind;
  }
  for (const c of comments) {
    const s = out[keyOf(c)];
    s.commentCount++;
    s.preview.push({ ...toCommentView(c, actor, c.postId ? postStaff : reportStaff, {
        maskAsReporterId: c.reportId ? reporterOf.get(c.reportId) : null,
      }), canEdit: false, canDelete: false });
    if (s.preview.length > 2) s.preview.shift();
  }
  return out;
}
