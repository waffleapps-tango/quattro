import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionActions } from "@/components/info/SectionActions";
import type { SectionWithContacts } from "@/domain/info";

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
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-lg">{section.title}</CardTitle>
        {canEdit && (
          <SectionActions section={section} communityId={communityId} isFirst={isFirst} isLast={isLast} />
        )}
      </CardHeader>
      <CardContent>
        {section.kind === "TEXT" ? (
          <p className="whitespace-pre-line text-sm">{section.body}</p>
        ) : (
          <ul className="divide-y">
            {section.contacts.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span>
                  {c.name}
                  {c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}
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
