import type { ReactNode } from "react";
import { StatusIllustration, type StatusVariant } from "./StatusIllustration";

const COPY: Record<StatusVariant, { code?: string; title: string; description: string }> = {
  "not-found": {
    code: "404",
    title: "Ta klatka prowadzi donikąd",
    description: "Nie znaleźliśmy tej strony. Wróć na dół, do strony głównej.",
  },
  error: {
    code: "Ups",
    title: "Coś poszło nie tak",
    description: "Awaria po naszej stronie. Spróbuj ponownie za chwilę.",
  },
  forbidden: {
    code: "403",
    title: "Tu wchodzą tylko osoby z kluczem",
    description: "Twoje konto nie ma dostępu do tej strony.",
  },
  waiting: {
    title: "Czekamy na zaproszenie",
    description:
      "Twoje konto nie jest jeszcze przypisane do wspólnoty. Poproś administratora o dostęp.",
  },
};

export function StatusScreen({
  variant,
  title,
  description,
  children,
}: {
  variant: StatusVariant;
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  const copy = COPY[variant];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-background px-6 py-10 text-center">
      <div className="flex w-full max-w-sm flex-col items-center">
        <StatusIllustration variant={variant} />
        {copy.code && (
          <p className="mt-2 text-6xl font-extrabold leading-none tracking-tight">{copy.code}</p>
        )}
        <h1 className="mt-3 text-xl font-semibold">{title ?? copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description ?? copy.description}</p>
        {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
