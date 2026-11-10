"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import { StatusIllustration, type StatusVariant } from "./StatusIllustration";

const CODE: Record<StatusVariant, string | undefined> = {
  "not-found": "404",
  error: undefined,
  forbidden: "403",
  waiting: undefined,
};
const KEY = {
  "not-found": "notFound",
  error: "error",
  forbidden: "forbidden",
  waiting: "waiting",
} as const;

export function StatusScreen({
  variant,
  title,
  description,
  children,
}: {
  variant: StatusVariant;
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  const t = useTranslations("system");
  const k = KEY[variant];
  const code = variant === "error" ? t("error.code") : CODE[variant];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-background px-6 py-10 text-center">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-heading text-lg font-semibold uppercase tracking-wide">Quattro</span>
      </div>
      <div className="flex w-full max-w-md flex-col items-center rounded-2xl bg-card px-8 py-10 shadow-[0_1px_2px_rgb(9_20_38/0.04),0_8px_32px_rgb(9_20_38/0.06)]">
        <StatusIllustration variant={variant} />
        {code && (
          <p className="mt-2 font-heading text-6xl font-semibold leading-none tracking-tight">{code}</p>
        )}
        <h1 className="mt-3 text-xl font-semibold">{title ?? t(`${k}.title`)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description ?? t(`${k}.description`)}</p>
        {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
