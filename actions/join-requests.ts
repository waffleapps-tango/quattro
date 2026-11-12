"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, type SessionUser } from "@/auth/session";
import {
  approveJoinRequest,
  cancelJoinRequest,
  createJoinRequest,
  rejectJoinRequest,
  setReceptionCanApprove,
} from "@/domain/join-requests";
import { dispatchPending } from "@/domain/notifications/dispatch";
import { NotFoundError, TenantMismatchError, UnauthorizedError, ValidationError } from "@/domain/errors";

type ActionState = { message: string; success: boolean };

const id = z.string().min(1).max(64);
const text = z.string().max(500);
const kind = z.enum(["OWNER", "TENANT"]);

const createSchema = z.object({
  communityId: id,
  buildingId: id,
  apartmentId: id,
  kind,
  note: text.optional(),
});
const overridesSchema = z.object({ buildingId: id, apartmentId: id, kind }).optional();

type Done = "sent" | "cancelled" | "approved" | "rejected" | "settingSaved";

// Every action: signed-in check, domain call, error -> message mapping, revalidation.
// Input validation lives in `work` (schema.parse); a ZodError is reported as "invalid".
async function perform(
  done: Done,
  work: (actor: SessionUser) => Promise<unknown>,
  { refresh, dispatch = false }: { refresh: "waiting" | "admin"; dispatch?: boolean },
): Promise<ActionState> {
  const t = await getTranslations("joinRequests");
  const te = await getTranslations("errors");
  const actor = await getCurrentUser();
  if (!actor) return { message: te("notSignedIn"), success: false };

  try {
    await work(actor);
  } catch (error) {
    if (error instanceof UnauthorizedError) return { message: te("forbidden"), success: false };
    if (error instanceof z.ZodError || error instanceof ValidationError || error instanceof TenantMismatchError) {
      return { message: t("errors.invalid"), success: false };
    }
    if (error instanceof NotFoundError) return { message: t("errors.notFound"), success: false };
    console.error(error);
    return { message: t("errors.generic"), success: false };
  }

  if (refresh === "waiting") revalidatePath("/", "layout");
  else revalidatePath("/admin/requests");
  if (dispatch) after(() => dispatchPending().catch(console.error));
  return { message: t(`actions.${done}`), success: true };
}

export async function createJoinRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return perform(
    "sent",
    (actor) =>
      createJoinRequest(
        actor,
        createSchema.parse({
          communityId: formData.get("communityId"),
          buildingId: formData.get("buildingId"),
          apartmentId: formData.get("apartmentId"),
          kind: formData.get("kind"),
          note: formData.get("note") || undefined,
        }),
      ),
    { refresh: "waiting", dispatch: true },
  );
}

export async function cancelJoinRequestAction(requestId: string): Promise<ActionState> {
  return perform("cancelled", (actor) => cancelJoinRequest(actor, id.parse(requestId)), { refresh: "waiting" });
}

export async function approveJoinRequestAction(
  requestId: string,
  overrides?: { buildingId: string; apartmentId: string; kind: "OWNER" | "TENANT" },
): Promise<ActionState> {
  return perform(
    "approved",
    (actor) => approveJoinRequest(actor, id.parse(requestId), overridesSchema.parse(overrides)),
    { refresh: "admin", dispatch: true },
  );
}

export async function rejectJoinRequestAction(requestId: string, reason?: string): Promise<ActionState> {
  return perform(
    "rejected",
    (actor) => rejectJoinRequest(actor, id.parse(requestId), text.optional().parse(reason)),
    { refresh: "admin", dispatch: true },
  );
}

export async function setReceptionCanApproveAction(communityId: string, value: boolean): Promise<ActionState> {
  return perform(
    "settingSaved",
    (actor) => setReceptionCanApprove(actor, id.parse(communityId), z.boolean().parse(value)),
    { refresh: "admin" },
  );
}
