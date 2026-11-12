import { CalendarDays } from "lucide-react";
import { useFormatter } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// One card shape for everything on the boards (posts, reports). The footer slot is where
// reactions and comments plug in.
export function FeedCard({
  eyebrow,
  badges,
  title,
  date,
  meta,
  highlighted,
  children,
  footer,
  className,
}: {
  eyebrow?: React.ReactNode;
  badges?: React.ReactNode;
  title: React.ReactNode;
  date: Date;
  meta?: React.ReactNode;
  highlighted?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const format = useFormatter();
  const when = new Date(date);
  return (
    <Card className={cn("gap-6", highlighted && "border-primary/40 bg-primary/[0.03]", className)}>
      <CardHeader className="gap-2">
        {(eyebrow || badges) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {eyebrow && (
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p>
            )}
            {badges}
          </div>
        )}
        <CardTitle className="font-heading text-2xl leading-tight sm:text-3xl">{title}</CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <time dateTime={when.toISOString()} className="tabular-nums">
              {format.dateTime(when, { dateStyle: "long" })}
            </time>
          </span>
          {meta}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-6">{children}</CardContent>
      {footer && <div className="border-t px-6 pt-4">{footer}</div>}
    </Card>
  );
}
