import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PostCard } from "@/components/posts/PostCard";
import { EmptyState } from "@/components/system/EmptyState";
import prisma from "@/lib/prisma";
import { CreatePostForm } from "@/components/posts/CreatePostForm";
import { AnimatedList, AnimatedItem } from "@/components/motion/AnimatedList";
import { Interactive } from "@/components/motion/Interactive";
import { FadeIn } from "@/components/motion/FadeIn";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";
import { canWritePosts } from "@/domain/posts";
import { WaitingScreen } from "@/components/system/WaitingScreen";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("posts") };
}

export default async function PostsPage() {
  const t = await getTranslations("posts");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.memberships[0]) return <WaitingScreen />;
  const canWrite = canWritePosts(user);
  const posts = await prisma.post.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  const postCount = await prisma.post.count()

  return (
    <div className="container mx-auto pb-8">
      <FadeIn className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
            {t("heading", { count: postCount })}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {canWrite && <CreatePostForm />}
      </FadeIn>

      {posts.length === 0 && (
        <EmptyState illustration="bulletin" title={t("empty")} description={canWrite ? t("emptyHint") : undefined} />
      )}
      <AnimatedList className="grid gap-4">
        {posts.map((post) => (
          <AnimatedItem key={post.id}>
            <Interactive>
              <Link href={`/posts/${post.slug}`} className="group block">
                <PostCard
                  post={post}
                  clamp
                  className="transition-[border-color,box-shadow] group-hover:border-border group-hover:shadow-[0_4px_12px_-2px_rgb(9_20_38/0.08)]"
                />
              </Link>
            </Interactive>
          </AnimatedItem>
        ))}
      </AnimatedList>
    </div>
  );
}
