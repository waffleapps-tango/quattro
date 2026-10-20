"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/system/StatusScreen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen variant="error">
      <Button onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }>Spróbuj ponownie</Button>
      <Button asChild variant="outline">
        <Link href="/">Strona główna</Link>
      </Button>
      {error.digest && (
        <p className="w-full text-xs text-muted-foreground">Kod błędu: {error.digest}</p>
      )}
    </StatusScreen>
  );
}
