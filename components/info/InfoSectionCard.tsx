import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionActions } from "@/components/info/SectionActions";
import type { SectionWithContacts } from "@/domain/info";

// Same card shape as PostCard (eyebrow, big title, divider, body); the staff actions sit top-right.
export function InfoSectionCard({
  section,
  communityId,
  canEdit,
  isFirst,
  isLast,
}: {
  section: SectionWithContacts;
  communityId: string;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("info");
  return (
    <Card className="gap-6">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {section.kind === "TEXT" ? t("kindText") : t("kindContacts")}
          </p>
          <CardTitle className="font-heading text-2xl leading-tight sm:text-3xl">{section.title}</CardTitle>
        </div>
        {canEdit && (
          <SectionActions section={section} communityId={communityId} isFirst={isFirst} isLast={isLast} />
        )}
      </CardHeader>
      <CardContent className="border-t pt-6">
        {section.kind === "TEXT" ? (
          <p className="whitespace-pre-line text-base leading-relaxed">{section.body}</p>
        ) : (
          <ul className="divide-y">
            {section.contacts.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4 py-3 text-base first:pt-0 last:pb-0">
                <span>
                  {c.name}
                  {c.note && <span className="block text-sm text-muted-foreground">{c.note}</span>}
                </span>
                <a
                  href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                  className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
                >
                  {c.phone}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
