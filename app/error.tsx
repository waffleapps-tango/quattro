"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/system/StatusScreen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen variant="error">
      <Button onClick={reset}>Spróbuj ponownie</Button>
      <Button asChild variant="outline">
        <Link href="/">Strona główna</Link>
      </Button>
      {error.digest && (
        <p className="w-full text-xs text-muted-foreground">Kod błędu: {error.digest}</p>
      )}
    </StatusScreen>
  );
}
