"use client";

import type { ReactNode } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { useViewer } from "@/components/NavList";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

// The client-only parts of the waiting screen (viewer avatar, sign-out), wrapped around
// server-rendered children so the card keeps its order: account, then content, then sign out.
export function WaitingScreenAccount({ children }: { children: ReactNode }) {
  const tc = useTranslations("common");
  const { user } = useViewer();
  return (
    <>
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
      {children}
      <SignOutButton>
        <Button variant="secondary" className="w-full sm:w-fit">
          <LogOut className="mr-2 h-4 w-4" />
          {tc("signOut")}
        </Button>
      </SignOutButton>
    </>
  );
}
