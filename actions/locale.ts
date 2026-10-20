"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { LOCALE_COOKIE, isLocale } from "@/i18n/locale";

export async function setLocaleAction(locale: string): Promise<{ success: boolean }> {
  if (!isLocale(locale)) return { success: false };

  (await cookies()).set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });

  const { userId } = await auth();
  if (userId) {
    await prisma.user.updateMany({ where: { clerkUserId: userId }, data: { locale } });
  }

  revalidatePath("/", "layout");
  return { success: true };
}
