"use client";

import { createContext, useContext, type ReactNode } from "react";

const AppNameContext = createContext("Quattro");

export function AppNameProvider({ value, children }: { value: string; children: ReactNode }) {
  return <AppNameContext.Provider value={value}>{children}</AppNameContext.Provider>;
}
// Short names keep the uppercase logotype; long ones switch to small sentence case so 4 lines can hold them (60 chars max).
export const brandNameClass = (name: string) =>
  name.length > 24 ? "text-xs leading-snug line-clamp-4" : "text-sm uppercase tracking-wide leading-tight line-clamp-2";
export const useAppName = () => useContext(AppNameContext);
