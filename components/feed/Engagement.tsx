"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, MessageCircle, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setReactionAction } from "@/actions/engagement";
import { applyReaction, REACTION_EMOJI, REACTION_KINDS, topReactions, type ReactionKindName, type ReactionSummary } from "@/lib/engagement";
import type { EngagementSummary, Target } from "@/domain/engagement";
import { Comments } from "./Comments";

const LONG_PRESS_MS = 450;

export function Engagement({
  target,
  initial,
  canReact = true,
  privateThread = false,
  defaultExpanded = false,
}: {
  target: Target;
  initial: EngagementSummary;
  canReact?: boolean;
  privateThread?: boolean;
  defaultExpanded?: boolean;
}) {
  const t = useTranslations("engagement");
  const [summary, setSummary] = useState<ReactionSummary>(initial);
  const [commentCount, setCommentCount] = useState(initial.commentCount);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);

  const react = (kind: ReactionKindName) => {
    const before = summary;
    setSummary(applyReaction(summary, kind));
    setPickerOpen(false);
    startTransition(async () => {
      const res = await setReactionAction(target, kind);
      if (res.ok) setSummary(res.data);
      else {
        setSummary(before);
        toast.error(res.message);
      }
    });
  };
  const startPress = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setPickerOpen(true);
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const mine = summary.mine;
  const top = topReactions(summary);

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        {summary.total > 0 ? (
          <span className="flex items-center gap-1" aria-label={t("reactionsCount", { count: summary.total })}>
            <span aria-hidden="true">{top.map((k) => REACTION_EMOJI[k]).join("")}</span>
            <span className="tabular-nums">{summary.total}</span>
          </span>
        ) : (
          <span />
        )}
        <button type="button" className="hover:underline" onClick={() => setExpanded((e) => !e)}>
          {t("comments", { count: commentCount })}
        </button>
      </div>

      <div className="flex items-center gap-1 border-y py-1">
        {canReact && (
          <div className="flex flex-1 items-center" onMouseLeave={endPress}>
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              aria-pressed={mine !== null}
              onPointerDown={startPress}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onClick={() => {
                if (longPressed.current) return;
                react(mine ?? "LIKE");
              }}
            >
              {mine ? (
                <span aria-hidden="true" className="mr-2">{REACTION_EMOJI[mine]}</span>
              ) : (
                <ThumbsUp className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {mine ? t(`react.${mine}`) : t("like")}
            </Button>
            <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen} modal={false}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={t("chooseReaction")}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="flex gap-1 p-1">
                {REACTION_KINDS.map((k) => (
                  <DropdownMenuItem
                    key={k}
                    onSelect={() => react(k)}
                    aria-label={t(`react.${k}`)}
                    className="text-2xl transition-transform hover:scale-125 focus:scale-125"
                  >
                    {REACTION_EMOJI[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={() => {
            setExpanded(true);
            setTimeout(() => composer.current?.focus(), 0);
          }}
        >
          <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("comment")}
        </Button>
      </div>

      {privateThread && <p className="text-xs text-muted-foreground">{t("privateThread")}</p>}
      <Comments
        target={target}
        preview={initial.preview}
        count={commentCount}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onCountChange={setCommentCount}
        composerRef={composer}
      />
    </div>
  );
}
