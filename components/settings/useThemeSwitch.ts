"use client";

import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type Origin = { x: number; y: number };

/** setTheme with an optional circular reveal from `origin` (falls back to instant swap). */
export function useThemeSwitch() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const apply = (next: string) => {
    flushSync(() => setTheme(next));
    // next-themes applies the class in an effect; make sure the snapshot sees it.
    const dark =
      next === "dark" ||
      (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  };

  const set = async (next: string, origin?: Origin) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!origin || reduce || !document.startViewTransition) return apply(next);
    const transition = document.startViewTransition(() => apply(next));
    // A skipped transition rejects these too; they are not errors for us.
    transition.updateCallbackDone.catch(() => {});
    transition.finished.catch(() => {});
    try {
      await transition.ready;
    } catch {
      return; // transition skipped (overlapping click, hidden tab): theme is already applied
    }
    const r = Math.hypot(
      Math.max(origin.x, innerWidth - origin.x),
      Math.max(origin.y, innerHeight - origin.y),
    );
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${r}px at ${origin.x}px ${origin.y}px)`] },
      { duration: 450, easing: "cubic-bezier(0.23, 1, 0.32, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  };

  return {
    mounted,
    theme: mounted ? theme ?? "system" : "system",
    resolved: (mounted ? resolvedTheme : "light") as "light" | "dark",
    set,
  };
}

export function centerOf(el: Element): Origin {
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}
