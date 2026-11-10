"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SectionDialog } from "@/components/info/SectionDialog";
import { deleteInfoSectionAction, moveInfoSectionAction } from "@/actions/info";
import type { SectionWithContacts } from "@/domain/info";

export function SectionActions({
  section,
  communityId,
  isFirst,
  isLast,
}: {
  section: SectionWithContacts;
  communityId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("info");
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ message: string; success: boolean }>) =>
    startTransition(async () => {
      const result = await work();
      if (!result.success) toast.error(result.message);
    });

  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("moveUp")}
        disabled={pending || isFirst}
        onClick={() => run(() => moveInfoSectionAction(section.id, "up"))}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("moveDown")}
        disabled={pending || isLast}
        onClick={() => run(() => moveInfoSectionAction(section.id, "down"))}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <SectionDialog communityId={communityId} section={section} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("delete")} className="text-destructive">
            <Trash className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run(() => deleteInfoSectionAction(section.id))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
