"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "./StatusScreen";

export function WaitingScreen() {
  const t = useTranslations("common");
  const { user } = useUser();
  return (
    <StatusScreen variant="waiting">
      {user && (
        <div className="flex w-full items-center gap-3 rounded-xl bg-muted p-3 text-left">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {user.firstName?.[0]}
              {user.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
      )}
      <SignOutButton>
        <Button variant="secondary">{t("signOut")}</Button>
      </SignOutButton>
    </StatusScreen>
  );
}
