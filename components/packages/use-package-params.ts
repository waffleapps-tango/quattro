"use client";

import { useCallback } from "react";
import { useNavTransition } from "@/components/system/nav-pending";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Writes a patch into the URL. A falsy value removes the key (defaults stay out of the URL).
// Any change except `page` itself returns to page 1.
export function usePackageParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [start] = useNavTransition();
  return useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      if (!("page" in patch)) params.delete("page");
      const qs = params.toString();
      start(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [router, pathname, searchParams, start],
  );
}
