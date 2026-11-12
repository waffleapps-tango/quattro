"use client";

import Image from "next/image";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ILLUSTRATION_SETS, type IllustrationPref } from "./illustration-prefs";

// Spot illustrations from the Stitch project, served from public/icons/<set>/.
export type IllustrationName =
  | "all-clear"
  | "bell"
  | "broken"
  | "building"
  | "bulletin"
  | "concierge"
  | "doorbell"
  | "elevator"
  | "floor-plan"
  | "handover"
  | "keys"
  | "lease"
  | "locker"
  | "maintenance"
  | "parcel"
  | "parking"
  | "residents"
  | "search-empty"
  | "settings"
  | "storage"
  | "trash"
  | "urgent";

const PrefContext = createContext<IllustrationPref>(ILLUSTRATION_SETS[0]);

export function IllustrationProvider({ value, children }: { value: IllustrationPref; children: ReactNode }) {
  return <PrefContext.Provider value={value}>{children}</PrefContext.Provider>;
}

export const useIllustrationPref = () => useContext(PrefContext);

export function Illustration({
  name,
  size = 64,
  className,
  priority,
}: {
  name: IllustrationName;
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const set = useIllustrationPref();
  if (set === "off") return null;
  return (
    <Image
      src={`/icons/${set}/${name}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      priority={priority}
      className={cn("shrink-0 select-none", className)}
    />
  );
}

// The large centred art for dialogs, empty states and status screens: 192px on phones, 256px
// from sm up, with a slow float that reduced-motion turns off. SVGs scale for free.
export function HeroIllustration({
  name,
  priority,
  className,
}: {
  name: IllustrationName;
  priority?: boolean;
  className?: string;
}) {
  if (useIllustrationPref() === "off") return null;
  return (
    <div className={cn("flex justify-center", className)}>
      <Illustration
        name={name}
        size={256}
        priority={priority}
        className="size-48 motion-safe:animate-float sm:size-64"
      />
    </div>
  );
}
