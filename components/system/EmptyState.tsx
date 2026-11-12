import type { ReactNode } from "react";
import { HeroIllustration, type IllustrationName } from "./Illustration";

export function EmptyState({
  illustration,
  title,
  description,
  children,
}: {
  illustration: IllustrationName;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <HeroIllustration name={illustration} />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
