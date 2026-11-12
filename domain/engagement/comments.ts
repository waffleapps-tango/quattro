import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { STAFF_ROLES } from "@/domain/packages/roles";
import { maskPerson } from "@/domain/privacy/person";
import type { Prisma } from "@/lib/generated/prisma";
import { resolveTarget, targetWhere, type Target } from "./targets";

export const MAX_COMMENT_LENGTH = 2000;

export const commentAuthorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  shareName: true,
} satisfies Prisma.UserSelect;

export type CommentView = {
  id: string;
  parentId: string | null;
  body: string;
  deleted: boolean;
  createdAt: Date;
  editedAt: Date | null;
  author: { name: string | null; own: boolean };
  canEdit: boolean;
  canDelete: boolean;
  replies: CommentView[];
};

type CommentRow = Prisma.CommentGetPayload<{ include: { author: { select: typeof commentAuthorSelect } } }>;

export function toCommentView(c: CommentRow, actor: SessionUser, viewerIsStaff: boolean): CommentView {
  const p = maskPerson(c.author, actor.id);
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  const own = c.authorId === actor.id;
  const deleted = c.deletedAt !== null;
  return {
    id: c.id,
    parentId: c.parentId,
    body: deleted ? "" : c.body,
    deleted,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    author: deleted
      ? { name: null, own: false }
      : { name: full || (viewerIsStaff || own ? p.email || null : null), own },
    canEdit: own && !deleted,
    canDelete: !deleted && (own || viewerIsStaff),
    replies: [],
  };
}

function cleanBody(body: string) {
  const text = body.trim();
  if (!text || text.length > MAX_COMMENT_LENGTH) throw new ValidationError("comment must be 1..2000 characters");
  return text;
}

const sameTarget = (c: { postId: string | null; reportId: string | null }, t: Target) =>
  t.type === "post" ? c.postId === t.id : c.reportId === t.id;

export async function listComments(actor: SessionUser, t: Target): Promise<CommentView[]> {
  const target = await resolveTarget(actor, t);
  return loadThread(actor, t, target.viewerIsStaff);
}

async function loadThread(actor: SessionUser, t: Target, viewerIsStaff: boolean): Promise<CommentView[]> {
  const rows = await prisma.comment.findMany({
    where: targetWhere(t),
    include: { author: { select: commentAuthorSelect } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const tops = new Map<string, CommentView>();
  for (const r of rows) if (!r.parentId) tops.set(r.id, toCommentView(r, actor, viewerIsStaff));
  for (const r of rows) {
    if (r.parentId && !r.deletedAt) tops.get(r.parentId)?.replies.push(toCommentView(r, actor, viewerIsStaff));
  }
  return [...tops.values()].filter((c) => !c.deleted || c.replies.length > 0);
}

export async function addComment(
  actor: SessionUser,
  t: Target,
  input: { body: string; parentId?: string },
): Promise<CommentView[]> {
  const target = await resolveTarget(actor, t);
  const body = cleanBody(input.body);
  let parent: { authorId: string } | null = null;
  if (input.parentId) {
    const p = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!p || p.deletedAt || p.parentId || !sameTarget(p, t)) throw new ValidationError("invalid parent comment");
    parent = p;
  }

  await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { authorId: actor.id, body, parentId: input.parentId ?? null, ...targetWhere(t) },
    });
    const recipients = new Map<string, "comment" | "reply">();
    if (target.authorId) recipients.set(target.authorId, "comment");
    if (parent && !recipients.has(parent.authorId)) recipients.set(parent.authorId, "reply");
    recipients.delete(actor.id);
    // Former members (and, on private reports, non-staff non-authors) must not hear about it.
    const members = await tx.membership.findMany({
      where: { communityId: target.communityId, userId: { in: [...recipients.keys()] } },
      select: { userId: true, role: true },
    });
    const allowed = new Set(
      members
        .filter((m) => !target.isPrivate || m.userId === target.authorId || STAFF_ROLES.includes(m.role))
        .map((m) => m.userId),
    );
    for (const id of [...recipients.keys()]) if (!allowed.has(id)) recipients.delete(id);
    for (const [recipientId, kind] of recipients) {
      await notify(tx, {
        communityId: target.communityId,
        type: "COMMENT_ADDED",
        recipientUserIds: [recipientId],
        payload: { targetType: t.type, targetId: t.id, title: target.title, slug: target.slug, kind },
        dedupeKey: `COMMENT_ADDED:${comment.id}:${recipientId}`,
      });
    }
  });
  return loadThread(actor, t, target.viewerIsStaff);
}

async function loadComment(t: Target, commentId: string) {
  const c = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!c || !sameTarget(c, t)) throw new NotFoundError(`Comment ${commentId} not found`);
  return c;
}

export async function editComment(actor: SessionUser, t: Target, commentId: string, body: string) {
  const target = await resolveTarget(actor, t);
  const c = await loadComment(t, commentId);
  if (c.authorId !== actor.id) throw new UnauthorizedError(`User ${actor.id} cannot edit comment ${commentId}`);
  if (c.deletedAt) throw new ValidationError("comment was deleted");
  await prisma.comment.update({ where: { id: c.id }, data: { body: cleanBody(body), editedAt: new Date() } });
  return loadThread(actor, t, target.viewerIsStaff);
}

export async function deleteComment(actor: SessionUser, t: Target, commentId: string) {
  const target = await resolveTarget(actor, t);
  const c = await loadComment(t, commentId);
  const own = c.authorId === actor.id;
  if (!own && !target.viewerIsStaff) throw new UnauthorizedError(`User ${actor.id} cannot delete comment ${commentId}`);
  if (!c.deletedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.comment.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
      if (!own) {
        await writeAuditLog(tx, {
          communityId: target.communityId,
          userId: actor.id,
          action: "COMMENT_DELETED",
          entity: "Comment",
          entityId: c.id,
          metadata: { authorId: c.authorId, target: `${t.type}:${t.id}` },
        });
      }
    });
  }
  return loadThread(actor, t, target.viewerIsStaff);
}
