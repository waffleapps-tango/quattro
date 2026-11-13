"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const hrefs = {
  users: "/admin/users",
  requests: "/admin/requests",
  notifications: "/admin/notifications",
  community: "/admin/community",
} as const;

export type AdminTab = keyof typeof hrefs;

export function AdminTabs({ tabs, pendingCount = 0 }: { tabs: AdminTab[]; pendingCount?: number }) {
  const t = useTranslations("admin.tabs");
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b" aria-label="Admin">
      {tabs.map((key) => {
        const href = hrefs[key];
        const active = pathname.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(key)}
            {key === "requests" && pendingCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
