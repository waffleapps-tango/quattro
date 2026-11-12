import { CalendarDays } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The post card shared by the board (/posts, text clamped) and the detail page (/posts/[slug], full text).
export function PostCard({
  post,
  clamp,
  className,
}: {
  post: { title: string; content: string; createdAt: Date };
  clamp?: boolean;
  className?: string;
}) {
  const t = useTranslations("posts");
  const format = useFormatter();
  return (
    <Card className={cn("gap-6", className)}>
      <CardHeader className="gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {t("eyebrow")}
        </p>
        <CardTitle className="font-heading text-2xl leading-tight sm:text-3xl">{post.title}</CardTitle>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          <time dateTime={post.createdAt.toISOString()} className="tabular-nums">
            {format.dateTime(post.createdAt, { dateStyle: "long" })}
          </time>
        </div>
      </CardHeader>
      <CardContent className="border-t pt-6">
        <p className={cn("whitespace-pre-line text-base leading-relaxed", clamp && "line-clamp-6")}>
          {post.content}
        </p>
      </CardContent>
    </Card>
  );
}
