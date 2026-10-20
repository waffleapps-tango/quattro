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

type ActionState = { message: string; success: boolean; fieldErrors?: Record<string, string> };

export async function createPackageAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Nie jesteś zalogowany", success: false };

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
      validated.error.issues.map((i) => [i.path.join("."), "To pole jest wymagane"]),
    );
    return { message: "Uzupełnij wymagane pola", success: false, fieldErrors };
  }

  try {
    await createPackage(actor, validated.data);
    revalidatePath("/packages");
    return { message: "Paczka zarejestrowana", success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: "Nie masz uprawnień do rejestrowania paczek", success: false };
    }
    if (error instanceof TenantMismatchError) {
      return { message: "Wybrane mieszkanie nie należy do wybranego budynku", success: false };
    }
    console.error(error);
    return { message: "Nie udało się zarejestrować paczki", success: false };
  }
}

export async function markPickedUpAction(packageId: string): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Nie jesteś zalogowany", success: false };

  try {
    await markPickedUp(actor, packageId);
    revalidatePath("/packages");
    return { message: "Paczka oznaczona jako odebrana", success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: "Nie znaleziono paczki", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "Nie masz uprawnień do tej operacji", success: false };
    }
    console.error(error);
    return { message: "Nie udało się zaktualizować paczki", success: false };
  }
}
