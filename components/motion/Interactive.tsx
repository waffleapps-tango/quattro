"use client";

import type { ReactNode } from "react";
import * as m from "motion/react-m";
import { quick } from "@/lib/motion";

export function Interactive({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={quick}>
      {children}
    </m.div>
  );
}
