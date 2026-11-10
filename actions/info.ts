"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { createSection, deleteSection, moveSection, updateSection } from "@/domain/info";
import { NotFoundError, UnauthorizedError } from "@/domain/errors";
import { InfoSectionKind } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean };

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(30),
  note: z.string().trim().max(200).optional(),
});

const sectionSchema = z.object({
  communityId: z.string().min(1),
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(100),
  kind: z.nativeEnum(InfoSectionKind),
  body: z.string().trim().max(5000),
  contacts: z.array(contactSchema).max(30),
});

function parseContacts(raw: FormDataEntryValue | null): unknown {
  try {
    const rows = JSON.parse(typeof raw === "string" ? raw : "[]");
    if (!Array.isArray(rows)) return [];
    // Drop rows the user left completely blank.
    return rows.filter((r) => r && (String(r.name ?? "").trim() || String(r.phone ?? "").trim()));
  } catch {
    return null;
  }
}

async function run(work: (t: Awaited<ReturnType<typeof getTranslations>>) => Promise<string>) {
  const t = await getTranslations("info.actions");
  try {
    return { message: await work(t), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: t("noPermission"), success: false };
    if (error instanceof NotFoundError) return { message: t("notFound"), success: false };
    console.error(error);
    return { message: t("failed"), success: false };
  }
}

export async function saveInfoSectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const validated = sectionSchema.safeParse({
    communityId: formData.get("communityId"),
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    kind: formData.get("kind"),
    body: formData.get("body") ?? "",
    contacts: parseContacts(formData.get("contacts")),
  });
  if (!validated.success) return { message: te("fillRequired"), success: false };

  const { id, communityId, ...input } = validated.data;
  const result = await run(async (t) => {
    if (id) await updateSection(actor, id, input);
    else await createSection(actor, communityId, input);
    return t("saved");
  });
  if (result.success) revalidatePath("/info");
  return result;
}

export async function deleteInfoSectionAction(sectionId: string): Promise<ActionState> {
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };
  const result = await run(async (t) => {
    await deleteSection(actor, sectionId);
    return t("deleted");
  });
  if (result.success) revalidatePath("/info");
  return result;
}

export async function moveInfoSectionAction(
  sectionId: string,
  direction: "up" | "down",
): Promise<ActionState> {
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };
  if (direction !== "up" && direction !== "down") return { message: te("invalidForm"), success: false };
  const result = await run(async (t) => {
    await moveSection(actor, sectionId, direction);
    return t("moved");
  });
  if (result.success) revalidatePath("/info");
  return result;
}
