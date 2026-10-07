"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
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

type ActionState = { message: string; success: boolean };

export async function createPackageAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Not signed in", success: false };

  const validated = createPackageSchema.safeParse({
    communityId: formData.get("communityId"),
    buildingId: formData.get("buildingId"),
    apartmentId: formData.get("apartmentId"),
    trackingNumber: formData.get("trackingNumber") || undefined,
    courier: formData.get("courier") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!validated.success) {
    return { message: "Invalid form data", success: false };
  }

  try {
    await createPackage(actor, validated.data);
    revalidatePath("/packages");
    return { message: "Package registered", success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: "You don't have permission to register packages", success: false };
    }
    if (error instanceof TenantMismatchError) {
      return { message: "Selected apartment doesn't belong to the selected building", success: false };
    }
    console.error(error);
    return { message: "Failed to register package", success: false };
  }
}

export async function markPickedUpAction(packageId: string): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Not signed in", success: false };

  try {
    await markPickedUp(actor, packageId);
    revalidatePath("/packages");
    return { message: "Package marked as picked up", success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: "Package not found", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "You don't have permission to do this", success: false };
    }
    console.error(error);
    return { message: "Failed to update package", success: false };
  }
}
