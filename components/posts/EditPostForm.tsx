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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Edit } from "lucide-react";
import { updatePost } from "@/actions/actions";
import { useActionState } from "react";
import { useTranslations } from "next-intl";

type PostState = {
  message: string;
  success?: boolean;
};

type EditPostFormProps = {
  post: {
    id: string;
    title: string;
    content: string;
  };
};

export function EditPostForm({ post }: EditPostFormProps) {
  const t = useTranslations("posts");
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
        <Button variant="ghost" size="icon">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>
            {t("editDescription")}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="id" value={post.id} />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                {t("titleLabel")}
              </label>
              <Input
                id="title"
                name="title"
                defaultValue={post.title}
                placeholder={t("titlePlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="content" className="text-sm font-medium">
                {t("contentLabel")}
              </label>
              <Textarea
                id="content"
                name="content"
                defaultValue={post.content}
                placeholder={t("contentPlaceholder")}
                required
                rows={5}
              />
            </div>
          </div>
          <Collapse show={Boolean(state.message) && !state.success}>
            <p className="text-sm text-destructive mb-2">{state.message}</p>
          </Collapse>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 