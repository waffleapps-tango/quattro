"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

// Must be rendered inside a <Link>.
export function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" aria-hidden="true" />
  ) : null;
}
