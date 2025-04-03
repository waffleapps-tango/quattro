"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Package,
  Home,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";

const routes = [
  {
    title: "Home",
    href: "/",
    icon: Home,
  },
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
    title: "Users",
    href: "/users",
    icon: Users,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function MainNavigation() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "hidden md:flex flex-col h-screen border-r bg-background transition-all duration-300",
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