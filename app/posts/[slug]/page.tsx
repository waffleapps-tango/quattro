import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";
import { canDeletePost, canEditPost, getPostBySlug } from "@/domain/posts";
import { NotFoundError } from "@/domain/errors";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EditPostForm } from "@/components/posts/EditPostForm";
import { DeletePostButton } from "@/components/posts/DeletePostButton";
import { Engagement } from "@/components/feed/Engagement";
import { EMPTY_ENGAGEMENT, engagementSummary } from "@/domain/engagement";
import { PostCard } from "@/components/posts/PostCard";

type PostPageParams = {
  params: Promise<{
    slug: string;
  }>;
}


export async function generateMetadata({ params }: PostPageParams): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("meta");
  const user = await getCurrentUser();
  if (!user) return { title: t("postNotFound") };
  try {
    return { title: (await getPostBySlug(user, slug)).title };
  } catch (error) {
    if (error instanceof NotFoundError) return { title: t("postNotFound") };
    throw error;
  }
}

export default async function PostPage({ params }: PostPageParams) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.memberships[0]) return <WaitingScreen />;
  const t = await getTranslations("posts");
  let post;
  try {
    post = await getPostBySlug(user, slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const canEdit = canEditPost(user, post);
  const canDelete = canDeletePost(user, post);
  const summaries = await engagementSummary(user, [{ type: "post", id: post.id }]);

  return (
    <div className="container mx-auto max-w-3xl pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/posts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
        {(canEdit || canDelete) && (
          <div className="flex gap-2">
            {canEdit && <EditPostForm post={post} />}
            {canDelete && <DeletePostButton postId={post.id} />}
          </div>
        )}
      </div>

      <PostCard
        post={post}
        footer={
          <Engagement
            target={{ type: "post", id: post.id }}
            initial={summaries[`post:${post.id}`] ?? EMPTY_ENGAGEMENT}
            defaultExpanded
          />
        }
      />
    </div>
  );
}
