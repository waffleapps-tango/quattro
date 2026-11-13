import { getAppUrl } from "@/lib/app-url";
import { createTranslator } from "next-intl";
import type { Notification, User } from "@/lib/generated/prisma";
import { resolveLocale } from "@/i18n/locale";
import en from "@/messages/en.json";
import pl from "@/messages/pl.json";

const catalogs = { en, pl };

// Same copy as the in-app inbox (notifications.types.<TYPE>), in the recipient's locale.
// createTranslator works outside a request, unlike getTranslations (cron / after()).
export function renderNotification(notification: Notification, user: User) {
  const locale = resolveLocale({ userLocale: user.locale });
  const messages = catalogs[locale];
  const types = createTranslator({ locale, messages, namespace: "notifications.types" });
  const email = createTranslator({ locale, messages, namespace: "notifications.email" });
  const values = notification.payload as Record<string, string | number>;
  const url = `${getAppUrl()}/settings`;
  return {
    title: types(`${notification.type}.title` as never, values as never),
    body: types(`${notification.type}.body` as never, values as never),
    footer: email("footer" as never, { url } as never),
  };
}
