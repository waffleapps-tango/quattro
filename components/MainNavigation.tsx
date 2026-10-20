"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Package,
  Home,
  Settings,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Shield, MessageSquare, Megaphone,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { PendingIndicator } from "@/components/system/PendingIndicator";

const publicRoutes = [
  {
    titleKey: "home" as const,
    href: "/",
    icon: Home,
  },
  {
    titleKey: "settings" as const,
    href: "/settings",
    icon: Settings,
  },
];

const protectedRoutes = [
  {
    titleKey: "packages" as const,
    href: "/packages",
    icon: Package,
  },
  {
    titleKey: "reports" as const,
    href: "/reports",
    icon: Megaphone,
  },
  {
    titleKey: "locations" as const,
    href: "/locations",
    icon: MapPin,
  },
  {
    titleKey: "posts" as const,
    href: "/posts",
    icon: MessageSquare,
  },
];

const adminRoutes = [
  {
    titleKey: "admin" as const,
    href: "/admin",
    icon: Shield,
  },
];

export function MainNavigation() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useUser();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    fetch("/api/me")
      .then((res) => res.json())
      .then((data: { role: string | null }) => setRole(data.role))
      .catch(() => setRole(null));
  }, [user]);

  const routes = user
    ? role === "ADMIN" || role === "MANAGER"
      ? [...publicRoutes, ...protectedRoutes, ...adminRoutes]
      : [...publicRoutes, ...protectedRoutes]
    : publicRoutes;

  return (
    <div
      className={cn(
        "hidden md:flex flex-col h-full border-r bg-background transition-[width] duration-200 ease-(--ease-in-out)",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex flex-col border-b min-h-[86px]">
        <div className="flex items-center justify-between p-4 h-full">
          <span aria-hidden={isCollapsed} className={cn("font-semibold whitespace-nowrap overflow-hidden transition-opacity duration-150 ease-out", isCollapsed && "opacity-0 w-0")}>Quattro</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-2">
          {routes.map((route) => {
            const Icon = route.icon;
            return (
              <Link
                key={route.href}
                href={route.href}
                title={isCollapsed ? t(route.titleKey) : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname === route.href
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span aria-hidden={isCollapsed} className={cn("whitespace-nowrap overflow-hidden transition-opacity duration-150 ease-out", isCollapsed && "opacity-0 w-0")}>{t(route.titleKey)}</span>
                {!isCollapsed && <PendingIndicator />}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
} 