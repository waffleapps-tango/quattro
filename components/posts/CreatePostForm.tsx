"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Plus } from "lucide-react";
import { createPost } from "@/actions/actions";
import { useActionState } from "react";

type PostState = {
  message: string;
  success?: boolean;
};

export function CreatePostForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PostState, FormData>(createPost, {
    message: "",
  });

  useEffect(() => {
    console.log("State:", state);

    if (state.success && !pending) {
      setOpen(false);
    }
  }, [state, pending]);


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj post
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowy post</DialogTitle>
          <DialogDescription>
            Podziel się przemyśleniami ze społecznością.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                {state.message}
                Tytuł
              </label>
              <Input
                id="title"
                name="title"
                placeholder="Wpisz tytuł posta"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="content" className="text-sm font-medium">
                Treść
              </label>
              <Textarea
                id="content"
                name="content"
                placeholder="Napisz treść posta"
                required
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Dodawanie..." : "Dodaj post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 