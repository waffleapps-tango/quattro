import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/system/StatusScreen";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <StatusScreen variant="not-found">
      <Button asChild>
        <Link href="/">{t("goHome")}</Link>
      </Button>
    </StatusScreen>
  );
}
