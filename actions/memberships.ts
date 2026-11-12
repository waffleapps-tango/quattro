"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/session";
import {
  createMembership,
  updateMembershipRole,
  removeMembership,
} from "@/domain/memberships";
import { UnauthorizedError, NotFoundError, TenantMismatchError, ValidationError } from "@/domain/errors";
import { inviteIfPending, sendInvite } from "@/domain/memberships/invites";
import { addResidency, removeResidency } from "@/domain/residencies";
import { ResidencyKind, Role } from "@/lib/generated/prisma";

const createMembershipSchema = z.object({
  communityId: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  buildingId: z.string().optional(),
  apartmentId: z.string().optional(),
  role: z.nativeEnum(Role),
  kind: z.nativeEnum(ResidencyKind).default(ResidencyKind.OWNER),
});

type ActionState = { message: string; success: boolean };

export async function createMembershipAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const validated = createMembershipSchema.safeParse({
    communityId: formData.get("communityId"),
    email: formData.get("email"),
    buildingId: formData.get("buildingId") || undefined,
    apartmentId: formData.get("apartmentId") || undefined,
    role: formData.get("role"),
    kind: formData.get("kind") || undefined,
  });

  if (!validated.success) {
    return { message: te("invalidForm"), success: false };
  }

  try {
    const { role, buildingId, apartmentId, communityId, email, kind } = validated.data;
    if (role === Role.RESIDENT) {
      if (!buildingId || !apartmentId) {
        return { message: t("apartmentRequired"), success: false };
      }
      await addResidency(actor, { communityId, email, buildingId, apartmentId, kind });
    } else {
      await createMembership(actor, { communityId, email, buildingId, role });
    }
    await inviteIfPending(actor, communityId, email);
    revalidatePath("/admin/users");
    return { message: t("created"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { message: t("createForbidden"), success: false };
    }
    if (error instanceof TenantMismatchError) {
      return { message: t("tenantMismatch"), success: false };
    }
    if (error instanceof ValidationError) {
      return { message: t("alreadyResident"), success: false };
    }
    console.error(error);
    return { message: t("createFailed"), success: false };
  }
}

export async function resendInviteAction(membershipId: string): Promise<ActionState> {
  const t = await getTranslations("admin.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await sendInvite(actor, membershipId);
    revalidatePath("/admin/users");
    return { message: t("inviteSent"), success: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: te("forbidden"), success: false };
    if (error instanceof ValidationError) return { message: t("inviteTooSoon"), success: false };
    console.error(error);
    return { message: t("inviteFailed"), success: false };
  }
}

export async function updateMembershipRoleAction(
  membershipId: string,
  newRole: Role,
): Promise<ActionState> {
  const t = await getTranslations("admin.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await updateMembershipRole(actor, membershipId, newRole);
    revalidatePath("/admin/users");
    return { message: t("roleChanged"), success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: t("notFound"), success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: t("roleForbidden"), success: false };
    }
    console.error(error);
    return { message: t("roleFailed"), success: false };
  }
}

export async function removeMembershipAction(membershipId: string): Promise<ActionState> {
  const t = await getTranslations("admin.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await removeMembership(actor, membershipId);
    revalidatePath("/admin/users");
    return { message: t("removed"), success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: t("notFound"), success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: t("removeForbidden"), success: false };
    }
    console.error(error);
    return { message: t("removeFailed"), success: false };
  }
}

export async function removeResidencyAction(residencyId: string): Promise<ActionState> {
  const t = await getTranslations("admin.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await removeResidency(actor, residencyId);
    revalidatePath("/admin/users");
    revalidatePath("/profile");
    return { message: t("residencyRemoved"), success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: t("notFound"), success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: t("removeForbidden"), success: false };
    }
    console.error(error);
    return { message: t("removeFailed"), success: false };
  }
}
