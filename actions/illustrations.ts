"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ILLUSTRATIONS_COOKIE, parseIllustrationPref } from "@/components/system/illustration-prefs";

// ponytail: per-browser cookie like the palette; move to the User row if it should follow the account.
export async function setIllustrationsAction(value: string): Promise<{ success: boolean }> {
  if (parseIllustrationPref(value) !== value) return { success: false };
  (await cookies()).set(ILLUSTRATIONS_COOKIE, value, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { success: true };
}
