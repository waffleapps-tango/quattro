"use client";

import type { ReactNode } from "react";
import * as m from "motion/react-m";
import { EASE_OUT, DURATION, MAX_STAGGERED, STAGGER } from "@/lib/motion";

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.base,
      ease: EASE_OUT,
      delay: Math.min(index, MAX_STAGGERED) * STAGGER,
    },
  }),
};

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} initial="hidden" animate="visible">
      {children}
    </m.div>
  );
}

// Must be rendered inside a Stagger parent (otherwise it shows without animation).
export function StaggerItem({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <m.div className={className} variants={item} custom={index}>
      {children}
    </m.div>
  );
}
