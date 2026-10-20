"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/system/StatusScreen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("common");
  const ts = useTranslations("system");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen variant="error">
      <Button onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }>{t("retry")}</Button>
      <Button asChild variant="outline">
        <Link href="/">{t("home")}</Link>
      </Button>
      {error.digest && (
        <p className="w-full text-xs text-muted-foreground">{ts("errorCode", { digest: error.digest })}</p>
      )}
    </StatusScreen>
  );
}
