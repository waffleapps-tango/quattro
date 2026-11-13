import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { inviteEmail } from "@/domain/join-requests/emails";
import { sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { linkResident } from "@/domain/residencies";
import { Role, type Community, type Membership, type ResidencyKind } from "@/lib/generated/prisma";

const RESEND_AFTER_MS = 10 * 60_000;
export const ALREADY_REGISTERED = "user already has an account";
export const INVITE_THROTTLED = "invite sent less than 10 minutes ago";

const MANAGERS: Role[] = [Role.MANAGER, Role.ADMIN];

// Managers always; reception only while the community switch is on.
export function canInviteResidents(
  membership: Pick<Membership, "role">,
  community: Pick<Community, "receptionCanInvite">,
): boolean {
  return MANAGERS.includes(membership.role) || (membership.role === Role.RECEPTIONIST && community.receptionCanInvite);
}

export async function requireInviter(actor: SessionUser, communityId: string) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!membership || !community || !canInviteResidents(membership, community)) {
    throw new UnauthorizedError(`User ${actor.id} cannot invite residents in ${communityId}`);
  }
  return { membership, community };
}

export const isPendingUser = (user: { clerkUserId: string }) => user.clerkUserId.startsWith("pending:");

// Sends (or resends) the invitation email to someone added by email who has no account yet.
// auto: called right after "Dodaj członka" — failures are reported, never thrown.
export async function sendInvite(actor: SessionUser, membershipId: string, opts: { auto?: boolean } = {}) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      user: { include: { residencies: { include: { apartment: { include: { building: true } } } } } },
      community: true,
    },
  });
  if (!membership) throw new NotFoundError(`Membership ${membershipId} not found`);
  const { membership: actorMembership } = await requireInviter(actor, membership.communityId);
  // Reception may only (re)invite residents, never staff.
  if (!MANAGERS.includes(actorMembership.role) && membership.role !== Role.RESIDENT) {
    throw new UnauthorizedError(`User ${actor.id} cannot invite role ${membership.role}`);
  }
  if (!isPendingUser(membership.user)) throw new ValidationError(ALREADY_REGISTERED);

  // Claim the resend slot atomically, so concurrent clicks cannot both pass the throttle.
  const prev = membership.inviteSentAt;
  const claimedAt = new Date();
  const claimed = await prisma.membership.updateMany({
    where: {
      id: membershipId,
      OR: [{ inviteSentAt: null }, { inviteSentAt: { lt: new Date(claimedAt.getTime() - RESEND_AFTER_MS) } }],
    },
    data: { inviteSentAt: claimedAt },
  });
  if (claimed.count === 0) throw new ValidationError(INVITE_THROTTLED);

  const residency = membership.user.residencies.find((r) => r.communityId === membership.communityId);
  const place = residency ? `${residency.apartment.building.name} / ${residency.apartment.number}` : "";
  const mail = inviteEmail(actor.locale, { email: membership.user.email, communityName: membership.community.name, place });
  // Without APP_URL the sign-up link would be relative and useless, so that counts as a failed send.
  const res = getAppUrl()
    ? await sendEmail({ to: membership.user.email, ...mail }).catch((e) => ({ ok: false as const, error: String(e) }))
    : { ok: false as const, error: "APP_URL not set" };
  if (!res.ok) {
    console.error("invite email failed", res.error);
    await prisma.membership.updateMany({ where: { id: membershipId }, data: { inviteSentAt: prev } });
    if (opts.auto) return { sent: false };
    throw new Error(`invite email failed: ${res.error}`);
  }
  await writeAuditLog(prisma, {
    communityId: membership.communityId,
    userId: actor.id,
    action: "MEMBERSHIP_INVITE_SENT",
    entity: "Membership",
    entityId: membership.id,
    metadata: { targetEmail: membership.user.email },
  });
  return { sent: true };
}

// Called after a member was added by email: invites them if (and only if) they are a no-account placeholder.
// Best effort — the outcome must never change the result of adding the member, so nothing is thrown.
export async function inviteIfPending(actor: SessionUser, communityId: string, email: string) {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !isPendingUser(user)) return;
    const membership = await prisma.membership.findUnique({
      where: { userId_communityId: { userId: user.id, communityId } },
    });
    if (membership) await sendInvite(actor, membership.id, { auto: true });
  } catch (error) {
    console.error("auto invite failed", error);
  }
}

// Invites someone to a specific apartment: links them (creating a no-account placeholder if needed) and emails them.
// The link is saved even if the email fails; `sent` tells the caller which happened.
export async function inviteToApartment(
  actor: SessionUser,
  input: { communityId: string; apartmentId: string; email: string; kind: ResidencyKind },
) {
  await requireInviter(actor, input.communityId);
  const apartment = await prisma.apartment.findUnique({ where: { id: input.apartmentId } });
  if (!apartment) throw new NotFoundError(`Apartment ${input.apartmentId} not found`);

  await prisma.$transaction((tx) =>
    linkResident(tx, { actorId: actor.id, ...input, buildingId: apartment.buildingId }),
  );
  const membership = await prisma.membership.findFirst({
    where: { communityId: input.communityId, user: { email: input.email } },
    include: { user: { select: { clerkUserId: true } } },
  });
  if (!membership || !isPendingUser(membership.user)) return { sent: false, registered: true };
  return sendInvite(actor, membership.id, { auto: true });
}

export async function setReceptionCanInvite(actor: SessionUser, communityId: string, value: boolean) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  if (!membership || !MANAGERS.includes(membership.role)) {
    throw new UnauthorizedError(`User ${actor.id} cannot change community settings`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { receptionCanInvite: value } });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "COMMUNITY_SETTINGS_CHANGED",
      entity: "Community",
      entityId: communityId,
      metadata: { receptionCanInvite: value },
    });
  });
}
