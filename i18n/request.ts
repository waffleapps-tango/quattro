import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { getRequestConfig } from "next-intl/server";
import prisma from "@/lib/prisma";
import { LOCALE_COOKIE, resolveLocale } from "./locale";

// ponytail: one indexed select per request for signed-in users; move the locale
// into the session object (getCurrentUser) if this ever shows up in profiles.
const savedLocale = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    select: { locale: true },
  });
  return user?.locale ?? null;
});

export default getRequestConfig(async () => {
  const [cookieStore, headerList, userLocale] = await Promise.all([
    cookies(),
    headers(),
    savedLocale(),
  ]);
  const locale = resolveLocale({
    userLocale,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
