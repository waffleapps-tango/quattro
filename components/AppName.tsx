"use client";

import { createContext, useContext, type ReactNode } from "react";

const AppNameContext = createContext("Quattro");

export function AppNameProvider({ value, children }: { value: string; children: ReactNode }) {
  return <AppNameContext.Provider value={value}>{children}</AppNameContext.Provider>;
}
export const useAppName = () => useContext(AppNameContext);
