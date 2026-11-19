import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { NotFoundError } from "@/domain/errors";
import { createPost } from "@/domain/posts";
import { PostKind, type Post } from "@/lib/generated/prisma";

export type SurveyResults = {
  options: { id: string; label: string; votes: number; mine: boolean }[];
  total: number;
  myVoteId: string | null;
};

// Staff-only check and option bounds (2..8, <=120 chars) live in createPost.
export const createSurveyPost = (
  actor: SessionUser,
  communityId: string,
  input: { title: string; content: string; options: string[] },
): Promise<Post> => createPost(actor, communityId, { ...input, kind: PostKind.SURVEY });

async function loadSurvey(actor: SessionUser, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { kind: true, communityId: true } });
  if (!post || post.kind !== PostKind.SURVEY || !actor.memberships.some((m) => m.communityId === post.communityId)) {
    throw new NotFoundError(`Survey ${postId} not found`);
  }
}

export async function castVote(actor: SessionUser, postId: string, optionId: string): Promise<void> {
  await loadSurvey(actor, postId);
  const option = await prisma.surveyOption.findFirst({ where: { id: optionId, postId }, select: { id: true } });
  if (!option) throw new NotFoundError(`Option ${optionId} not found`);
  await prisma.surveyVote.upsert({
    where: { postId_userId: { postId, userId: actor.id } },
    create: { postId, userId: actor.id, optionId },
    update: { optionId },
  });
}

export async function getSurveyResults(actor: SessionUser, postId: string): Promise<SurveyResults> {
  await loadSurvey(actor, postId);
  const [options, votes] = await Promise.all([
    prisma.surveyOption.findMany({ where: { postId }, orderBy: { position: "asc" } }),
    prisma.surveyVote.findMany({ where: { postId }, select: { optionId: true, userId: true } }),
  ]);
  const mine = votes.find((v) => v.userId === actor.id)?.optionId ?? null;
  return {
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      votes: votes.filter((v) => v.optionId === o.id).length,
      mine: o.id === mine,
    })),
    total: votes.length,
    myVoteId: mine,
  };
}
