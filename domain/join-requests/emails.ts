import { createTranslator } from "next-intl";
import { resolveLocale } from "@/i18n/locale";
import en from "@/messages/en.json";
import pl from "@/messages/pl.json";

const catalogs = { en, pl };
const appUrl = () => (process.env.APP_URL ?? "").replace(/\/+$/, "");

function tr(userLocale: string | null | undefined) {
  const locale = resolveLocale({ userLocale });
  return createTranslator({ locale, messages: catalogs[locale], namespace: "emails" });
}

export function decisionEmail(
  userLocale: string | null | undefined,
  input: { approved: boolean; communityName: string; reason?: string | null },
) {
  const t = tr(userLocale);
  const key = input.approved ? "approved" : "rejected";
  return {
    subject: t(`${key}.subject` as never, { communityName: input.communityName } as never),
    text: t(`${key}.text` as never, { communityName: input.communityName, reason: input.reason ?? "", url: appUrl() } as never),
  };
}

export function inviteEmail(
  userLocale: string | null | undefined,
  input: { email: string; communityName: string; place: string },
) {
  const t = tr(userLocale);
  const url = `${appUrl()}/sign-up?email=${encodeURIComponent(input.email)}`;
  return {
    subject: t("invite.subject" as never, { communityName: input.communityName } as never),
    text: t("invite.text" as never, { communityName: input.communityName, place: input.place, url } as never),
  };
}
