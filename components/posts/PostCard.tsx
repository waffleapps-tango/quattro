import Link from "next/link";
import { UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { FeedCard } from "@/components/feed/FeedCard";
import { cn } from "@/lib/utils";
import type { PostView } from "@/domain/posts";

type PostCardPost = Pick<PostView, "title" | "content" | "createdAt" | "kind" | "pinned" | "pinnedUntil" | "author">;

export function PostCard({
  post,
  clamp,
  href,
  className,
  footer,
}: {
  post: PostCardPost;
  clamp?: boolean;
  href?: string;
  className?: string;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("posts");
  const format = useFormatter();
  const a = post.author;
  const authorName =
    post.kind === "ANNOUNCEMENT"
      ? t("boardAuthor")
      : (a && ([a.firstName, a.lastName].filter(Boolean).join(" ") || a.email)) || t("neighborFallback");
  return (
    <FeedCard
      eyebrow={t(`kind.${post.kind}`)}
      badges={
        post.pinned && post.pinnedUntil ? (
          <Badge variant="info" className="ml-auto">
            {/* pinnedUntil is stored as end of the chosen day in CET (22:59:59 UTC), so the UTC calendar date is the day the user picked. */}
            {t("pinnedBadge", {
              date: format.dateTime(new Date(post.pinnedUntil), { dateStyle: "medium", timeZone: "UTC" }),
            })}
          </Badge>
        ) : null
      }
      title={href ? <Link href={href} className="hover:underline">{post.title}</Link> : post.title}
      date={post.createdAt}
      meta={
        <span className="flex items-center gap-1.5">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          {authorName}
        </span>
      }
      highlighted={post.pinned}
      className={className}
      footer={footer}
    >
      <p className={cn("whitespace-pre-line text-base leading-relaxed", clamp && "line-clamp-6")}>{post.content}</p>
    </FeedCard>
  );
}
