"use client";

import "./globals.css";
import { useEffect } from "react";
import { StatusScreen } from "@/components/system/StatusScreen";

export default function GlobalError({
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
    <html lang="pl">
      <body>
        <StatusScreen variant="error">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Spróbuj ponownie
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces the root layout, Link may not render */}
          <a href="/" className="rounded-md border px-4 py-2 text-sm font-medium">
            Strona główna
          </a>
          {error.digest && (
            <p className="w-full text-xs text-muted-foreground">Kod błędu: {error.digest}</p>
          )}
        </StatusScreen>
      </body>
    </html>
  );
}
