"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PostFields({
  defaultTitle = "",
  defaultContent = "",
}: {
  defaultTitle?: string;
  defaultContent?: string;
}) {
  const t = useTranslations("posts");
  const [length, setLength] = useState(defaultContent.length);

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="title" className="text-sm font-medium">
            {t("titleLabel")}
          </label>
          <span className="text-xs text-muted-foreground">{t("required")}</span>
        </div>
        <Input
          id="title"
          name="title"
          defaultValue={defaultTitle}
          placeholder={t("titlePlaceholder")}
          required
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="content" className="text-sm font-medium">
            {t("contentLabel")}
          </label>
          <span className="text-xs text-muted-foreground">{t("plainText")}</span>
        </div>
        <Textarea
          id="content"
          name="content"
          defaultValue={defaultContent}
          placeholder={t("contentPlaceholder")}
          required
          rows={8}
          onChange={(e) => setLength(e.target.value.length)}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("plainTextHint")}
          </span>
          <span className="shrink-0 tabular-nums">{t("chars", { count: length })}</span>
        </div>
      </div>
    </div>
  );
}
