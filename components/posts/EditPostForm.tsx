"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/motion/Collapse";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PostFields } from "@/components/posts/PostFields";
import { Check, Edit } from "lucide-react";
import { updatePost } from "@/actions/actions";
import { useActionState } from "react";
import { useFormatter, useTranslations } from "next-intl";

type PostState = {
  message: string;
  success?: boolean;
};

type EditPostFormProps = {
  post: {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
  };
};

export function EditPostForm({ post }: EditPostFormProps) {
  const t = useTranslations("posts");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PostState, FormData>(updatePost, {
    message: "",
  });

  useEffect(() => {
    if (state.success && !pending) {
      setOpen(false);
    }
  }, [state, pending]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="mr-2 h-4 w-4" />
          {t("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>
            {t("editDescription")}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="id" value={post.id} />
          <PostFields defaultTitle={post.title} defaultContent={post.content} />
          <Collapse show={Boolean(state.message) && !state.success}>
            <p className="text-sm text-destructive mb-2">{state.message}</p>
          </Collapse>
          <DialogFooter className="items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t("publishedOn", { date: format.dateTime(post.createdAt, { dateStyle: "long" }) })}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                <Check className="mr-2 h-4 w-4" />
                {pending ? t("saving") : t("saveChanges")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 