"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUser } from "@clerk/nextjs";
import {
  Home,
  Info,
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

type Item = { titleKey: "home" | "packages" | "reports" | "posts" | "locations" | "info" | "admin" | "profile" | "settings"; href: string; icon: typeof Home };

const home: Item = { titleKey: "home", href: "/", icon: Home };
const settings: Item = { titleKey: "settings", href: "/settings", icon: Settings };
const modules: Item[] = [
  { titleKey: "packages", href: "/packages", icon: Package },
  { titleKey: "reports", href: "/reports", icon: Megaphone },
  { titleKey: "posts", href: "/posts", icon: MessageSquare },
  { titleKey: "locations", href: "/locations", icon: MapPin },
  { titleKey: "info", href: "/info", icon: Info },
];
const admin: Item = { titleKey: "admin", href: "/admin", icon: Shield };
const profile: Item = { titleKey: "profile", href: "/profile", icon: UserRound };

type Me = {
  role: string | null;
  impersonated?: boolean;
  user?: { firstName: string | null; lastName: string | null; email: string };
};

export type ViewerUser = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl?: string;
  primaryEmailAddress?: { emailAddress: string } | null;
};

// TEMPORARY E2E: inlined at build time, so false (and the extra fetch gone) on Vercel.
const E2E = process.env.NEXT_PUBLIC_E2E_IMPERSONATE === "1";

// The signed-in user (Clerk, or the dev impersonation stand-in) plus their role from /api/me.
export function useViewer(): { user: ViewerUser | null; role: string | null; impersonated: boolean } {
  const { user: clerkUser } = useUser();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!clerkUser && !E2E) {
      setMe(null);
      return;
    }
    fetch("/api/me")
      .then((res) => res.json())
      .then((data: Me) => setMe(data))
      .catch(() => setMe(null));
  }, [clerkUser]);

  const stand = me?.impersonated && me.user ? me.user : null;
  const user: ViewerUser | null =
    clerkUser ??
    (stand && {
      firstName: stand.firstName,
      lastName: stand.lastName,
      fullName: [stand.firstName, stand.lastName].filter(Boolean).join(" ") || null,
      primaryEmailAddress: { emailAddress: stand.email },
    });
  return { user, role: me?.role ?? null, impersonated: !!stand };
}

export function NavList({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { user, role } = useViewer();

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
            const active = route.href === "/" ? pathname === "/" : pathname === route.href || pathname.startsWith(`${route.href}/`);
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
