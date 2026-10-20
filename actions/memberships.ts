"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/session";
import {
  createMembership,
  updateMembershipRole,
  removeMembership,
} from "@/domain/memberships";
import { UnauthorizedError, NotFoundError, TenantMismatchError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

const createMembershipSchema = z.object({
  communityId: z.string().min(1),
  email: z.string().email(),
  buildingId: z.string().optional(),
  apartmentId: z.string().optional(),
  role: z.nativeEnum(Role),
});

type ActionState = { message: string; success: boolean };

export async function createMembershipAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Nie jesteś zalogowany", success: false };

  const validated = createMembershipSchema.safeParse({
    communityId: formData.get("communityId"),
    email: formData.get("email"),
    buildingId: formData.get("buildingId") || undefined,
    apartmentId: formData.get("apartmentId") || undefined,
    role: formData.get("role"),
  });

  if (!validated.success) {
    return { message: "Nieprawidłowe dane formularza", success: false };
  }

  try {
    await createMembership(actor, validated.data);
    revalidatePath("/admin");
    return { message: "Członek dodany", success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: "Nie masz uprawnień do dodawania członków", success: false };
    }
    if (error instanceof TenantMismatchError) {
      return { message: "Wybrane mieszkanie lub budynek nie należy do tej wspólnoty", success: false };
    }
    console.error(error);
    return { message: "Nie udało się dodać członka", success: false };
  }
}

export async function updateMembershipRoleAction(
  membershipId: string,
  newRole: Role,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Nie jesteś zalogowany", success: false };

  try {
    await updateMembershipRole(actor, membershipId, newRole);
    revalidatePath("/admin");
    return { message: "Rola zmieniona", success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: "Nie znaleziono członka", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "Nie masz uprawnień do zmiany ról", success: false };
    }
    console.error(error);
    return { message: "Nie udało się zmienić roli", success: false };
  }
}

export async function removeMembershipAction(membershipId: string): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Nie jesteś zalogowany", success: false };

  try {
    await removeMembership(actor, membershipId);
    revalidatePath("/admin");
    return { message: "Członek usunięty", success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: "Nie znaleziono członka", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "Nie masz uprawnień do usuwania członków", success: false };
    }
    console.error(error);
    return { message: "Nie udało się usunąć członka", success: false };
  }
}
