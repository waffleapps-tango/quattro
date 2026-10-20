"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { createPackage, markPickedUp } from "@/domain/packages";
import { UnauthorizedError, NotFoundError, TenantMismatchError } from "@/domain/errors";

const createPackageSchema = z.object({
  communityId: z.string().min(1),
  buildingId: z.string().min(1),
  apartmentId: z.string().min(1),
  trackingNumber: z.string().optional(),
  courier: z.string().optional(),
  notes: z.string().optional(),
});

type ActionState = { message: string; success: boolean; fieldErrors?: Record<string, string> };

export async function createPackageAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("packages.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const validated = createPackageSchema.safeParse({
    communityId: formData.get("communityId"),
    buildingId: formData.get("buildingId"),
    apartmentId: formData.get("apartmentId"),
    trackingNumber: formData.get("trackingNumber") || undefined,
    courier: formData.get("courier") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!validated.success) {
    const fieldErrors = Object.fromEntries(
      validated.error.issues.map((i) => [i.path.join("."), te("fieldRequired")]),
    );
    return { message: te("fillRequired"), success: false, fieldErrors };
  }

  try {
    await createPackage(actor, validated.data);
    revalidatePath("/packages");
    return { message: t("created"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: t("noPermissionCreate"), success: false };
    }
    if (error instanceof TenantMismatchError) {
      return { message: t("apartmentMismatch"), success: false };
    }
    console.error(error);
    return { message: t("createFailed"), success: false };
  }
}

export async function markPickedUpAction(packageId: string): Promise<ActionState> {
  const t = await getTranslations("packages.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await markPickedUp(actor, packageId);
    revalidatePath("/packages");
    return { message: t("pickedUp"), success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: t("notFound"), success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: t("noPermission"), success: false };
    }
    console.error(error);
    return { message: t("updateFailed"), success: false };
  }
}
