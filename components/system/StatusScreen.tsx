"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-background px-6 py-10 text-center">
      <div className="flex w-full max-w-sm flex-col items-center">
        <StatusIllustration variant={variant} />
        {code && (
          <p className="mt-2 text-6xl font-extrabold leading-none tracking-tight">{code}</p>
        )}
        <h1 className="mt-3 text-xl font-semibold">{title ?? t(`${k}.title`)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description ?? t(`${k}.description`)}</p>
        {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
