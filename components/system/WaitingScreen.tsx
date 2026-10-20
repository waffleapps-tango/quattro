"use client";

import { SignOutButton } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "./StatusScreen";

export function WaitingScreen() {
  const t = useTranslations("common");
  return (
    <StatusScreen variant="waiting">
      <SignOutButton>
        <Button variant="outline">{t("signOut")}</Button>
      </SignOutButton>
    </StatusScreen>
  );
}
