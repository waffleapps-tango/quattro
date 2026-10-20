"use client";

import "./globals.css";
import { useEffect } from "react";
import { StatusIllustration } from "@/components/system/StatusIllustration";

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
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-background px-6 py-10 text-center">
          <div className="flex w-full max-w-sm flex-col items-center">
            <StatusIllustration variant="error" />
            <h1 className="mt-3 text-xl font-semibold">Coś poszło nie tak / Something went wrong</h1>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Spróbuj ponownie / Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces the root layout, Link may not render */}
              <a href="/" className="rounded-md border px-4 py-2 text-sm font-medium">
                Strona główna / Home
              </a>
              {error.digest && (
                <p className="w-full text-xs text-muted-foreground">Kod błędu / Error code: {error.digest}</p>
              )}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
