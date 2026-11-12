import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { WaitingScreen } from "@/components/system/WaitingScreen";
import { EmptyState } from "@/components/system/EmptyState";
import { getCurrentUser } from "@/auth/session";
import { INFO_EDIT_ROLES, listSections } from "@/domain/info";
import { InfoSectionCard } from "@/components/info/InfoSectionCard";
import { SectionDialog } from "@/components/info/SectionDialog";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("info") };
}

export default async function InfoPage() {
  const t = await getTranslations("info");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // ponytail: first membership's community, same as the other pages.
  const membership = user.memberships[0];
  if (!membership) return <WaitingScreen />;

  const sections = await listSections(user, membership.communityId);
  const canEdit = INFO_EDIT_ROLES.includes(membership.role);

  return (
    <div className="container mx-auto pb-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canEdit && <SectionDialog communityId={membership.communityId} />}
      </div>
      {sections.length === 0 ? (
        <EmptyState
          illustration="concierge"
          title={t("empty")}
          description={canEdit ? t("emptyHint") : t("emptyResident")}
        />
      ) : (
        <div className="grid gap-4">
          {sections.map((section, i) => (
            <InfoSectionCard
              key={section.id}
              section={section}
              communityId={membership.communityId}
              canEdit={canEdit}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
