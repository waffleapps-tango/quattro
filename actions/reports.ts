"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/session";
import { changeStatus, createReport } from "@/domain/reports";
import {
  InvalidTransitionError,
  NotFoundError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import { ReportStatus, ReportType } from "@/lib/generated/prisma";

type ActionState = { message: string; success: boolean; fieldErrors?: Record<string, string> };

const createReportSchema = z.object({
  communityId: z.string().min(1),
  categoryKey: z.string().min(1),
  type: z.nativeEnum(ReportType),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  urgent: z.boolean(),
  parkingSpaceId: z.string().min(1).optional(),
  storageUnitId: z.string().min(1).optional(),
});

export async function createReportAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Nie jesteś zalogowany", success: false };

  const validated = createReportSchema.safeParse({
    communityId: formData.get("communityId"),
    categoryKey: formData.get("categoryKey"),
    type: formData.get("type"),
    title: formData.get("title"),
    description: formData.get("description"),
    urgent: formData.get("urgent") === "on",
    parkingSpaceId: formData.get("parkingSpaceId") || undefined,
    storageUnitId: formData.get("storageUnitId") || undefined,
  });

  if (!validated.success) {
    const fieldErrors = Object.fromEntries(
      validated.error.issues.map((i) => [i.path.join("."), "To pole jest wymagane"]),
    );
    return { message: "Uzupełnij wymagane pola", success: false, fieldErrors };
  }

  try {
    await createReport(actor, validated.data);
    revalidatePath("/reports");
    return { message: "Zgłoszenie wysłane", success: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { message: "Sprawdź dane zgłoszenia", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "Nie możesz złożyć tego zgłoszenia", success: false };
    }
    if (error instanceof TenantMismatchError) {
      return { message: "To miejsce nie jest przypisane do Twojego mieszkania", success: false };
    }
    console.error(error);
    return { message: "Nie udało się wysłać zgłoszenia", success: false };
  }
}

export async function changeReportStatusAction(
  reportId: string,
  status: ReportStatus,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { message: "Nie jesteś zalogowany", success: false };

  const parsed = z.nativeEnum(ReportStatus).safeParse(status);
  if (!parsed.success) return { message: "Nieprawidłowy status", success: false };

  try {
    await changeStatus(actor, reportId, parsed.data);
    revalidatePath("/reports");
    return { message: "Status zmieniony", success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: "Nie znaleziono zgłoszenia", success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: "Nie masz uprawnień do tej zmiany", success: false };
    }
    if (error instanceof InvalidTransitionError) {
      return { message: "Ta zmiana statusu nie jest możliwa", success: false };
    }
    console.error(error);
    return { message: "Nie udało się zmienić statusu", success: false };
  }
}
