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
import { Plus } from "lucide-react";
import { createPost } from "@/actions/actions";
import { useActionState } from "react";
import { useTranslations } from "next-intl";

type PostState = {
  message: string;
  success?: boolean;
};

export function CreatePostForm() {
  const t = useTranslations("posts");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PostState, FormData>(createPost, {
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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newTitle")}</DialogTitle>
          <DialogDescription>
            {t("newDescription")}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <PostFields />
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
              {pending ? t("adding") : t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 