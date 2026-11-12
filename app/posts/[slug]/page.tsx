import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/auth/session";
import { canWritePosts } from "@/domain/posts";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EditPostForm } from "@/components/posts/EditPostForm";
import { DeletePostButton } from "@/components/posts/DeletePostButton";
import { PostCard } from "@/components/posts/PostCard";

type PostPageParams = {
  params: Promise<{
    slug: string;
  }>;
}


export async function generateMetadata({ params }: PostPageParams): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("meta");
  const post = await prisma.post.findUnique({ where: { slug }, select: { title: true } });
  return { title: post?.title ?? t("postNotFound") };
}

export default async function PostPage({ params }: PostPageParams) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.memberships[0]) return <WaitingScreen />;
  const canWrite = canWritePosts(user);
  const t = await getTranslations("posts");
  const post = await prisma.post.findUnique({
    where: { slug },
  });

  if (!post) notFound();

  return (
    <div className="container mx-auto max-w-3xl pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/posts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
        {canWrite && (
          <div className="flex gap-2">
            <EditPostForm post={post} />
            <DeletePostButton postId={post.id} />
          </div>
        )}
      </div>

      <PostCard post={post} />
    </div>
  );
}
