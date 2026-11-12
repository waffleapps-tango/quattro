"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
  listCommentsAction,
} from "@/actions/engagement";
import type { CommentView, Target } from "@/domain/engagement";

const visibleCount = (list: CommentView[]) =>
  list.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.length, 0);

export function Comments({
  target,
  preview,
  count,
  expanded,
  onExpand,
  onCountChange,
  composerRef,
}: {
  target: Target;
  preview: CommentView[];
  count: number;
  expanded: boolean;
  onExpand: () => void;
  onCountChange: (n: number) => void;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("engagement");
  const [thread, setThread] = useState<CommentView[] | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (res: { ok: true; data: CommentView[] } | { ok: false; message: string }) => {
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setThread(res.data);
    onCountChange(visibleCount(res.data));
  };

  useEffect(() => {
    if (expanded && thread === null) startTransition(async () => apply(await listCommentsAction(target)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const send = (body: string, parentId?: string) =>
    new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const res = await addCommentAction(target, body, parentId);
        apply(res);
        if (res.ok) onExpand();
        resolve(res.ok);
      }),
    );

  const shown = expanded ? (thread ?? preview) : preview;

  return (
    <div className="space-y-3">
      {!expanded && count > preview.length && (
        <button type="button" className="text-sm font-medium text-muted-foreground hover:underline" onClick={onExpand}>
          {t("showAll", { count })}
        </button>
      )}
      <ul className="space-y-3">
        {shown.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            busy={pending}
            onReply={(body) => send(body, c.id)}
            onEdit={(id, body) => startTransition(async () => apply(await editCommentAction(target, id, body)))}
            onDelete={(id) => startTransition(async () => apply(await deleteCommentAction(target, id)))}
            canReply={expanded}
          />
        ))}
      </ul>
      <Composer
        placeholder={t("placeholder")}
        busy={pending}
        textareaRef={composerRef}
        onSubmit={(body) => send(body)}
      />
    </div>
  );
}

function Composer({
  placeholder,
  busy,
  onSubmit,
  textareaRef,
  onCancel,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onCancel?: () => void;
}) {
  const t = useTranslations("engagement");
  const [body, setBody] = useState("");
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        if (await onSubmit(body)) setBody("");
      }}
    >
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={1}
        maxLength={2000}
        className="min-h-9 resize-none bg-muted"
      />
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
      )}
      <Button type="submit" size="sm" disabled={busy || !body.trim()}>
        {t("send")}
      </Button>
    </form>
  );
}

function CommentItem({
  comment,
  busy,
  onReply,
  onEdit,
  onDelete,
  canReply,
  isReply = false,
}: {
  comment: CommentView;
  busy: boolean;
  onReply: (body: string) => Promise<boolean>;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  canReply: boolean;
  isReply?: boolean;
}) {
  const t = useTranslations("engagement");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className={isReply ? "ml-8" : undefined}>
      <div className="rounded-xl bg-muted px-3 py-2 text-sm">
        {comment.deleted ? (
          <p className="italic text-muted-foreground">{t("deleted")}</p>
        ) : (
          <>
            <p className="font-medium">{comment.author.name ?? t("neighbor")}</p>
            {editing ? (
              <form
                className="mt-1 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onEdit(comment.id, draft);
                  setEditing(false);
                }}
              >
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={2} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={busy || !draft.trim()}>{t("save")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button>
                </div>
              </form>
            ) : (
              <p className="whitespace-pre-line">{comment.body}</p>
            )}
          </>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 px-3 text-xs text-muted-foreground">
        <time dateTime={new Date(comment.createdAt).toISOString()}>
          {format.relativeTime(new Date(comment.createdAt), now)}
        </time>
        {comment.editedAt && !comment.deleted && <span>{t("edited")}</span>}
        {canReply && !isReply && !comment.deleted && (
          <button type="button" className="font-medium hover:underline" onClick={() => setReplying((r) => !r)}>
            {t("reply")}
          </button>
        )}
        {comment.canEdit && !editing && (
          <button type="button" className="font-medium hover:underline" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
        )}
        {comment.canDelete &&
          (confirming ? (
            <button type="button" className="font-medium text-destructive hover:underline" onClick={() => onDelete(comment.id)}>
              {t("confirmDelete")}
            </button>
          ) : (
            <button type="button" className="font-medium hover:underline" onClick={() => setConfirming(true)}>
              {t("delete")}
            </button>
          ))}
      </div>
      {comment.replies.length > 0 && (
        <ul className="mt-2 space-y-2">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} busy={busy} onReply={onReply} onEdit={onEdit} onDelete={onDelete} canReply={false} isReply />
          ))}
        </ul>
      )}
      {replying && (
        <div className="ml-8 mt-2">
          <Composer
            placeholder={t("replyPlaceholder")}
            busy={busy}
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const ok = await onReply(body);
              if (ok) setReplying(false);
              return ok;
            }}
          />
        </div>
      )}
    </li>
  );
}
