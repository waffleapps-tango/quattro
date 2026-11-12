import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { NotFoundError } from "@/domain/errors";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { Role } from "@/lib/generated/prisma";

export type Target = { type: "post" | "report"; id: string };
export type ResolvedTarget = {
  communityId: string;
  authorId: string | null;
  title: string;
  slug: string; // "" for reports
  isPrivate: boolean;
  viewerIsStaff: boolean;
};

const POST_STAFF: Role[] = [Role.MANAGER, Role.ADMIN];

export const targetKey = (t: Target) => `${t.type}:${t.id}`;
export const targetWhere = (t: Target) =>
  t.type === "post" ? { postId: t.id } : { reportId: t.id };

// Same visibility as the post/report pages; anything not visible is "not found" (no existence leak).
export async function resolveTarget(
  actor: SessionUser,
  t: Target,
): Promise<ResolvedTarget> {
  if (t.type === "post") {
    const post = await prisma.post.findUnique({
      where: { id: t.id },
      select: { communityId: true, authorId: true, title: true, slug: true },
    });
    const m =
      post && actor.memberships.find((x) => x.communityId === post.communityId);
    if (!post || !m) throw new NotFoundError(`Post ${t.id} not found`);
    return {
      ...post,
      isPrivate: false,
      viewerIsStaff: POST_STAFF.includes(m.role),
    };
  }
  const report = await prisma.report.findUnique({
    where: { id: t.id },
    select: {
      communityId: true,
      authorId: true,
      title: true,
      visibility: true,
    },
  });
  const m =
    report &&
    actor.memberships.find((x) => x.communityId === report.communityId);
  if (!report || !m) throw new NotFoundError(`Report ${t.id} not found`);
  const viewerIsStaff = STAFF_ROLES.includes(m.role);
  const isPrivate = report.visibility === "PRIVATE";
  if (isPrivate && report.authorId !== actor.id && !viewerIsStaff)
    throw new NotFoundError(`Report ${t.id} not found`);
  return {
    communityId: report.communityId,
    authorId: report.authorId,
    title: report.title,
    slug: "",
    isPrivate,
    viewerIsStaff,
  };
}
