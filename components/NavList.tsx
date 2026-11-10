"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUser } from "@clerk/nextjs";
import {
  Home,
  MapPin,
  Megaphone,
  MessageSquare,
  Package,
  Settings,
  Shield,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PendingIndicator } from "@/components/system/PendingIndicator";

type Item = { titleKey: "home" | "packages" | "reports" | "posts" | "locations" | "admin" | "profile" | "settings"; href: string; icon: typeof Home };

const home: Item = { titleKey: "home", href: "/", icon: Home };
const settings: Item = { titleKey: "settings", href: "/settings", icon: Settings };
const modules: Item[] = [
  { titleKey: "packages", href: "/packages", icon: Package },
  { titleKey: "reports", href: "/reports", icon: Megaphone },
  { titleKey: "posts", href: "/posts", icon: MessageSquare },
  { titleKey: "locations", href: "/locations", icon: MapPin },
];
const admin: Item = { titleKey: "admin", href: "/admin", icon: Shield };
const profile: Item = { titleKey: "profile", href: "/profile", icon: UserRound };

export function useRole() {
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
  return role;
}

export function NavList({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { user } = useUser();
  const role = useRole();

  const canAdmin = role === "ADMIN" || role === "MANAGER";
  const groups: { label?: string; items: Item[] }[] = user
    ? [
        { label: t("groupModules"), items: [home, ...modules] },
        { label: t("groupSystem"), items: [...(canAdmin ? [admin] : []), profile, settings] },
      ]
    : [{ items: [home, settings] }];

  return (
    <nav className="space-y-5 p-3">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-1">
          {group.label && (
            <p
              aria-hidden={collapsed}
              className={cn(
                "px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-opacity",
                collapsed && "h-0 overflow-hidden opacity-0 pb-0",
              )}
            >
              {group.label}
            </p>
          )}
          {group.items.map((route) => {
            const Icon = route.icon;
            const active = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                title={collapsed ? t(route.titleKey) : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(9_20_38/0.06)]"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active && "text-secondary-foreground")} />
                <span
                  aria-hidden={collapsed}
                  className={cn(
                    "overflow-hidden whitespace-nowrap transition-opacity duration-150 ease-out",
                    collapsed && "w-0 opacity-0",
                  )}
                >
                  {t(route.titleKey)}
                </span>
                {!collapsed && <PendingIndicator />}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
