"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useNavTransition } from "@/components/system/nav-pending";

// Same pending behaviour as the other URL-driven filters: <NavPending> on the page dims the list.
export function PostKindTabs({
  label,
  chips,
}: {
  label: string;
  chips: { href: string; label: string; active: boolean }[];
}) {
  const router = useRouter();
  const [start] = useNavTransition();
  return (
    <nav aria-label={label} className="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1">
      {chips.map((c) => (
        <Button key={c.href} asChild size="sm" variant={c.active ? "default" : "ghost"}>
          <Link
            href={c.href}
            aria-current={c.active ? "page" : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              start(() => router.push(c.href));
            }}
          >
            {c.label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
