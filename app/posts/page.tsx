import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PostCard } from "@/components/posts/PostCard";
import { EmptyState } from "@/components/system/EmptyState";
import { Button } from "@/components/ui/button";
import { PostKind } from "@/lib/generated/prisma";
import { CreatePostForm } from "@/components/posts/CreatePostForm";
import { AnimatedList, AnimatedItem } from "@/components/motion/AnimatedList";
import { Engagement } from "@/components/feed/Engagement";
import { FadeIn } from "@/components/motion/FadeIn";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";
import { canPostAnnouncement, listPosts } from "@/domain/posts";
import { EMPTY_ENGAGEMENT, engagementSummary } from "@/domain/engagement";
import { WaitingScreen } from "@/components/system/WaitingScreen";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("posts") };
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const t = await getTranslations("posts");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const { kind: kindParam } = await searchParams;
  const kind =
    kindParam === "announcement" ? PostKind.ANNOUNCEMENT : kindParam === "neighbor" ? PostKind.NEIGHBOR : undefined;
  const posts = await listPosts(user, membership.communityId, { kind });
  const summaries = await engagementSummary(user, posts.map((p) => ({ type: "post" as const, id: p.id })));
  const canAnnounce = canPostAnnouncement(membership);
  const emptyDescription = !kind || (kind === PostKind.ANNOUNCEMENT && canAnnounce) ? t("emptyHint") : undefined;
  const chips = [
    { href: "/posts", label: t("filterAll"), active: !kind },
    { href: "/posts?kind=announcement", label: t("filterAnnouncements"), active: kind === PostKind.ANNOUNCEMENT },
    { href: "/posts?kind=neighbor", label: t("filterNeighbors"), active: kind === PostKind.NEIGHBOR },
  ];

  return (
    <div className="container mx-auto pb-8">
      <FadeIn className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
            {t("heading", { count: posts.length })}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <CreatePostForm canAnnounce={canAnnounce} />
      </FadeIn>

      <nav aria-label={t("kindLabel")} className="mb-4 inline-flex gap-1 rounded-xl bg-muted p-1">
        {chips.map((c) => (
          <Button key={c.href} asChild size="sm" variant={c.active ? "default" : "ghost"}>
            <Link href={c.href} aria-current={c.active ? "page" : undefined}>
              {c.label}
            </Link>
          </Button>
        ))}
      </nav>

      {posts.length === 0 && (
        <EmptyState illustration="bulletin" title={kind === PostKind.NEIGHBOR ? t("emptyNeighbors") : t("empty")}
          description={emptyDescription} />
      )}
      <AnimatedList className="grid gap-4">
        {posts.map((post) => (
          <AnimatedItem key={post.id}>
            <PostCard
              post={post}
              clamp
              href={`/posts/${post.slug}`}
              footer={
                <Engagement
                  target={{ type: "post", id: post.id }}
                  initial={summaries[`post:${post.id}`] ?? EMPTY_ENGAGEMENT}
                />
              }
            />
          </AnimatedItem>
        ))}
      </AnimatedList>
    </div>
  );
}
