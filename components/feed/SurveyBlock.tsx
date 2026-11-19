"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Circle, CircleDot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { voteSurvey } from "@/actions/surveys";
import type { SurveyResults } from "@/domain/surveys";
import { cn } from "@/lib/utils";

// Moves the user's vote to `optionId` in a results snapshot.
function withVote(r: SurveyResults, optionId: string): SurveyResults {
  return {
    myVoteId: optionId,
    total: r.total + (r.myVoteId ? 0 : 1),
    options: r.options.map((o) => ({
      ...o,
      mine: o.id === optionId,
      votes: o.votes + (o.id === optionId ? 1 : 0) - (o.id === r.myVoteId ? 1 : 0),
    })),
  };
}

export function SurveyBlock({ postId, results }: { postId: string; results: SurveyResults }) {
  const t = useTranslations("posts.survey");
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [optimistic, apply] = useOptimistic(results, withVote);
  const voted = optimistic.myVoteId !== null;

  const vote = (optionId: string) => {
    if (pending || optionId === optimistic.myVoteId) return;
    setPendingId(optionId);
    startTransition(async () => {
      apply(optionId);
      const res = await voteSurvey(postId, optionId);
      if (!res.ok) toast.error(res.message);
      setPendingId(null);
    });
  };

  return (
    <div className="mt-4 space-y-2" role="radiogroup" aria-label={t("label")}>
      {optimistic.options.map((o) => {
        const pct = optimistic.total ? Math.round((o.votes / optimistic.total) * 100) : 0;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={o.mine}
            disabled={pending}
            onClick={() => vote(o.id)}
            className={cn(
              "relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 disabled:opacity-70",
              o.mine && "border-primary",
            )}
          >
            {voted && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-primary/10 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            )}
            <span className="relative shrink-0">
              {pendingId === o.id ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : o.mine ? (
                <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
            </span>
            <span className="relative min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{o.label}</span>
            {voted && (
              <span className="relative shrink-0 tabular-nums text-muted-foreground">
                {pct}% ({o.votes})
              </span>
            )}
          </button>
        );
      })}
      <p className="text-xs text-muted-foreground">{voted ? t("total", { count: optimistic.total }) : t("hint")}</p>
    </div>
  );
}
