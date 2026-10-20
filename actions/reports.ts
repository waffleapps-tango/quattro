"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("reports.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

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
      validated.error.issues.map((i) => [i.path.join("."), te("fieldRequired")]),
    );
    return { message: te("fillRequired"), success: false, fieldErrors };
  }

  try {
    await createReport(actor, validated.data);
    revalidatePath("/reports");
    return { message: t("sent"), success: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { message: t("invalid"), success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: t("cannotFile"), success: false };
    }
    if (error instanceof TenantMismatchError) {
      return { message: t("spaceMismatch"), success: false };
    }
    console.error(error);
    return { message: t("sendFailed"), success: false };
  }
}

export async function changeReportStatusAction(
  reportId: string,
  status: ReportStatus,
): Promise<ActionState> {
  const t = await getTranslations("reports.actions");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  const parsed = z.nativeEnum(ReportStatus).safeParse(status);
  if (!parsed.success) return { message: t("invalidStatus"), success: false };

  try {
    await changeStatus(actor, reportId, parsed.data);
    revalidatePath("/reports");
    return { message: t("statusChanged"), success: true };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { message: t("notFound"), success: false };
    }
    if (error instanceof UnauthorizedError) {
      return { message: t("noPermission"), success: false };
    }
    if (error instanceof InvalidTransitionError) {
      return { message: t("invalidTransition"), success: false };
    }
    console.error(error);
    return { message: t("statusFailed"), success: false };
  }
}
