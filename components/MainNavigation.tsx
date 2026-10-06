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
  Shield, MessageSquare,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";

const publicRoutes = [
  {
    title: "Home",
    href: "/",
    icon: Home,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

const protectedRoutes = [
  {
    title: "Packages",
    href: "/packages",
    icon: Package,
  },
  {
    title: "Locations",
    href: "/locations",
    icon: MapPin,
  },
  {
    title: "Posts",
    href: "/posts",
    icon: MessageSquare,
  },
];

const adminRoutes = [
  {
    title: "Admin",
    href: "/admin",
    icon: Shield,
  },
];

export function MainNavigation() {
  const pathname = usePathname();
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
        "hidden md:flex flex-col h-full border-r bg-background transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex flex-col border-b min-h-[86px]">
        <div className="flex items-center justify-between p-4 h-full">
          {!isCollapsed && <span className="font-semibold">Quattro</span>}
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
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname === route.href
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {!isCollapsed && <span>{route.title}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
} 