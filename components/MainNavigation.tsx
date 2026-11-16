"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { initials } from "@/lib/initials";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { NavList, useViewer } from "@/components/NavList";
import { brandNameClass, useAppName } from "@/components/AppName";

export function MainNavigation() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, role } = useViewer();
  const tAdmin = useTranslations("admin");
  const tNav = useTranslations("nav");
  const appName = useAppName();

  return (
    <div
      className={cn(
        "hidden lg:flex flex-col h-full border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-(--ease-in-out)",
        isCollapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-[86px] shrink-0 items-center gap-2 px-4",
          isCollapsed ? "flex-col justify-center" : "justify-between",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </span>
          <span
            aria-hidden={isCollapsed}
            className={cn(
              "min-w-0 break-words font-heading font-semibold transition-opacity duration-150 ease-out",
              brandNameClass(appName),
              isCollapsed && "hidden",
            )}
            title={appName}
          >
            {appName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? tNav("expand") : tNav("collapse")}
          className={cn("hidden shrink-0 lg:flex", isCollapsed && "size-7")}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <NavList collapsed={isCollapsed} />
      </ScrollArea>
      {user && (
        <div className="p-3">
          <div className="flex items-center gap-3 rounded-xl bg-card p-2.5 shadow-[0_1px_2px_rgb(9_20_38/0.05)]">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                {initials(user.firstName, user.lastName)}
              </AvatarFallback>
            </Avatar>
            <div aria-hidden={isCollapsed} className={cn("min-w-0 leading-tight", isCollapsed && "hidden")}>
              <p className="truncate text-sm font-medium">{user.fullName ?? user.primaryEmailAddress?.emailAddress}</p>
              {role && (
                <p className="truncate text-xs text-muted-foreground">
                  {tAdmin(`role.${role as "ADMIN"}`)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
