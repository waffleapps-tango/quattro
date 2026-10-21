"use client";

import type { ReactNode } from "react";
import * as m from "motion/react-m";
import { EASE_OUT, DURATION } from "@/lib/motion";

// ponytail: the server renders the initial (hidden) state, so entrance wrappers are
// invisible until hydration; acceptable for decorative entrances only.
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT, delay }}
    >
      {children}
    </m.div>
  );
}
