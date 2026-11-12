import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { inviteEmail } from "@/domain/join-requests/emails";
import { sendEmail } from "@/lib/email";
import { Role } from "@/lib/generated/prisma";

const RESEND_AFTER_MS = 10 * 60_000;

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
  const actorMembership = actor.memberships.find((m) => m.communityId === membership.communityId);
  if (!actorMembership || (actorMembership.role !== Role.MANAGER && actorMembership.role !== Role.ADMIN)) {
    throw new UnauthorizedError(`User ${actor.id} cannot send invites`);
  }
  if (!isPendingUser(membership.user)) throw new ValidationError("user already has an account");
  if (membership.inviteSentAt && Date.now() - membership.inviteSentAt.getTime() < RESEND_AFTER_MS) {
    throw new ValidationError("invite sent less than 10 minutes ago");
  }

  const residency = membership.user.residencies.find((r) => r.communityId === membership.communityId);
  const place = residency ? `${residency.apartment.building.name} / ${residency.apartment.number}` : "";
  const mail = inviteEmail(actor.locale, { email: membership.user.email, communityName: membership.community.name, place });
  const res = await sendEmail({ to: membership.user.email, ...mail });
  if (!res.ok) {
    console.error("invite email failed", res.error);
    if (opts.auto) return { sent: false };
    throw new Error(`invite email failed: ${res.error}`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membership.id }, data: { inviteSentAt: new Date() } });
    await writeAuditLog(tx, {
      communityId: membership.communityId,
      userId: actor.id,
      action: "MEMBERSHIP_INVITE_SENT",
      entity: "Membership",
      entityId: membership.id,
      metadata: { targetEmail: membership.user.email },
    });
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
