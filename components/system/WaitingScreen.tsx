"use client";

import { SignOutButton } from "@clerk/nextjs";
import { useViewer } from "@/components/NavList";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HeroIllustration } from "./Illustration";

export function WaitingScreen() {
  const t = useTranslations("system.waiting");
  const tc = useTranslations("common");
  const { user } = useViewer();
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-background px-6 py-10">
      <div className="flex flex-col items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary font-heading text-xl font-semibold text-primary-foreground shadow-md">
          Q
        </span>
        <span className="font-heading text-lg font-semibold uppercase tracking-wide">Quattro</span>
      </div>
      <div className="flex w-full max-w-[680px] flex-col gap-6 rounded-2xl bg-card p-8 shadow-[0_1px_2px_rgb(9_20_38/0.04),0_8px_32px_rgb(9_20_38/0.06)]">
        <HeroIllustration name="doorbell" priority />
        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm">
          <span className="h-2 w-2 rounded-full bg-[#805533]" aria-hidden="true" />
          <span className="font-medium">{t("status")}</span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span>{t("statusDetail")}</span>
        </div>
        {user && (
          <div className="flex items-center gap-4 rounded-xl p-1">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary text-base text-primary-foreground">
                {user.firstName?.[0]}
                {user.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-semibold">{user.fullName}</p>
              <p className="truncate text-sm text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <SignOutButton>
          <Button variant="secondary" className="w-full sm:w-fit">
            <LogOut className="mr-2 h-4 w-4" />
            {tc("signOut")}
          </Button>
        </SignOutButton>
      </div>
    </div>
  );
}
