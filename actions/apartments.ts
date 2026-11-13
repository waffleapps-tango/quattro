"use server";

import { z } from "zod";
import { getCurrentUser, type SessionUser } from "@/auth/session";
import { UnauthorizedError, NotFoundError } from "@/domain/errors";
import {
  listApartmentsLite,
  listFloorApartments,
  type ApartmentOption,
  type OverviewApartment,
} from "@/domain/residencies/overview";

export type LoadResult<T> = { ok: true; data: T } | { ok: false };

const id = z.string().min(1).max(64);

// Read-only loaders for admin client components. Failures collapse to { ok: false }; the UI shows a retry hint.
async function load<T>(fn: (actor: SessionUser) => Promise<T>): Promise<LoadResult<T>> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false };
  try {
    return { ok: true, data: await fn(actor) };
  } catch (error) {
    if (!(error instanceof UnauthorizedError || error instanceof NotFoundError)) console.error(error);
    return { ok: false };
  }
}

export async function getFloorApartmentsAction(
  communityId: string,
  buildingId: string,
  floor: number | null,
  onlyVacant: boolean,
): Promise<LoadResult<OverviewApartment[]>> {
  return load((actor) =>
    listFloorApartments(
      actor,
      id.parse(communityId),
      id.parse(buildingId),
      z.number().int().nullable().parse(floor),
      { onlyVacant: z.boolean().parse(onlyVacant) },
    ),
  );
}

export async function getBuildingApartmentsAction(
  communityId: string,
  buildingId: string,
): Promise<LoadResult<ApartmentOption[]>> {
  return load((actor) => listApartmentsLite(actor, id.parse(communityId), id.parse(buildingId)));
}
