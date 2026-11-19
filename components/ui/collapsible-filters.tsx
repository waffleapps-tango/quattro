"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Open on desktop, collapsed on phones. The viewport is only known after mount, so SSR renders open
// and a phone collapses on the first effect (no hydration mismatch).
export function CollapsibleFilters({
  activeCount = 0,
  children,
  className,
}: {
  activeCount?: number;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("common");
  const id = useId();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!window.matchMedia("(min-width: 640px)").matches) setOpen(false);
  }, []);

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 w-full items-center gap-2 rounded-lg text-sm font-medium sm:w-auto"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        {t("filters")}
        {!open && activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
        <ChevronDown
          className={cn("size-4 transition-transform duration-150 ease-out motion-reduce:transition-none", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <div
        id={id}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2 px-0.5 pb-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
