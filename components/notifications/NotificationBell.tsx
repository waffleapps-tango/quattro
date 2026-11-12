"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Illustration } from "@/components/system/Illustration";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/notifications";
import type { NotificationType } from "@/domain/notifications/types";

type Item = {
  id: string;
  type: NotificationType;
  payload: Record<string, string | number>;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      // Network blip: keep showing the previous state.
    }
  }, []);

  // Refresh on every navigation and whenever the menu opens.
  useEffect(() => {
    load();
  }, [load, pathname, open]);

  const openItem = async (item: Item) => {
    try {
      if (!item.readAt) await markNotificationReadAction(item.id);
    } catch (error) {
      console.error(error);
    }
    router.push(
      item.type === "POST_ANNOUNCEMENT"
        ? `/posts/${item.payload.slug}`
        : item.type.startsWith("REPORT_")
          ? "/reports?view=mine"
          : "/packages",
    );
    void load();
  };

  const markAll = async () => {
    try {
      await markAllNotificationsReadAction();
    } catch (error) {
      console.error(error);
    }
    await load();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("open", { count: unread })}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        {unread > 0 && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              markAll();
            }}
            className="text-sm text-primary"
          >
            {t("markAllRead")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-sm text-muted-foreground">
            <Illustration name="bell" size={128} />
            {t("empty")}
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => openItem(item)}
              className="flex flex-col items-start gap-0.5"
            >
              <span className={item.readAt ? "text-sm" : "text-sm font-semibold"}>
                {t(`types.${item.type}.title`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`types.${item.type}.body`, item.payload)}
              </span>
              <span className="text-xs text-muted-foreground">
                {format.relativeTime(new Date(item.createdAt), now)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
