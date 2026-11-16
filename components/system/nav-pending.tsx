"use client";

import { useEffect, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Filters, sorting and pagination write to the URL from several components. Each one pushes inside
// useNavTransition(), and <NavPending> anywhere on the page dims its content until the server answers.
let active = 0;
const listeners = new Set<() => void>();
const bump = (by: number) => {
  active += by;
  listeners.forEach((l) => l());
};

export function useNavTransition() {
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!pending) return;
    bump(1);
    return () => bump(-1);
  }, [pending]);
  return [start, pending] as const;
}

export function useNavPending() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => active > 0,
    () => false,
  );
}

export function NavPending({ children, className }: { children: ReactNode; className?: string }) {
  const pending = useNavPending();
  return (
    <div className={cn("relative", className)} aria-busy={pending}>
      <div
        className={cn(
          "transition-opacity duration-150 ease-out",
          pending && "pointer-events-none opacity-50",
        )}
      >
        {children}
      </div>
      {pending && (
        <Loader2
          className="absolute left-1/2 top-8 size-6 -translate-x-1/2 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
