"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Package,
  Home,
  Settings,
  MapPin,
  Shield,
  Megaphone,
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
];

const adminRoutes = [
  {
    titleKey: "admin" as const,
    href: "/admin",
    icon: Shield,
  },
];

export function MobileNavigation() {
  const pathname = usePathname();
  const t = useTranslations("nav");
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
    <nav className="flex flex-col gap-1 p-2">
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
            <span>{t(route.titleKey)}</span>
            <PendingIndicator />
          </Link>
        );
      })}
    </nav>
  );
} 