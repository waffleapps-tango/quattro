"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "./StatusScreen";

export function AccessDenied() {
  const t = useTranslations("common");
  return (
    <StatusScreen variant="forbidden">
      <Button asChild>
        <Link href="/">{t("goHome")}</Link>
      </Button>
    </StatusScreen>
  );
}
