import prisma from "@/lib/prisma";
import type { SessionUser } from "@/auth/session";
import { writeAuditLog } from "@/domain/audit/log";
import { NotFoundError, TenantMismatchError, UnauthorizedError, ValidationError } from "@/domain/errors";
import { notify } from "@/domain/notifications";
import { sendEmail } from "@/lib/email";
import { decisionEmail } from "./emails";
import {
  JoinRequestStatus,
  Role,
  type Community,
  type JoinRequest,
  type Membership,
  type Prisma,
  type ResidencyKind,
} from "@/lib/generated/prisma";

const MANAGERS: Role[] = [Role.MANAGER, Role.ADMIN];
const MAX_TEXT = 500;

export function canDecideJoinRequests(
  membership: Pick<Membership, "role">,
  community: Pick<Community, "receptionCanApproveJoinRequests">,
): boolean {
  return (
    MANAGERS.includes(membership.role) ||
    (membership.role === Role.RECEPTIONIST && community.receptionCanApproveJoinRequests)
  );
}

export async function requireApprover(actor: SessionUser, communityId: string) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!membership || !community || !canDecideJoinRequests(membership, community)) {
    throw new UnauthorizedError(`User ${actor.id} cannot decide join requests in ${communityId}`);
  }
  return { membership, community };
}

export async function approverIds(tx: Prisma.TransactionClient, communityId: string): Promise<string[]> {
  const community = await tx.community.findUniqueOrThrow({ where: { id: communityId } });
  const roles = community.receptionCanApproveJoinRequests ? [...MANAGERS, Role.RECEPTIONIST] : MANAGERS;
  const members = await tx.membership.findMany({ where: { communityId, role: { in: roles } }, select: { userId: true } });
  return members.map((m) => m.userId);
}

const cleanText = (s: string | undefined | null) => {
  const t = (s ?? "").trim();
  if (t.length > MAX_TEXT) throw new ValidationError(`text longer than ${MAX_TEXT}`);
  return t || null;
};

const displayName = (u: { firstName: string | null; lastName: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || null;

export type JoinOptions = {
  communities: { id: string; name: string; buildings: { id: string; name: string; apartments: { id: string; number: string }[] }[] }[];
  requests: {
    id: string;
    communityId: string;
    status: JoinRequestStatus;
    buildingName: string;
    apartmentNumber: string;
    kind: ResidencyKind;
    createdAt: Date;
    rejectReason: string | null;
  }[];
};

// ponytail: offers every community; fine while one deployment serves one community.
export async function getJoinOptions(actor: SessionUser): Promise<JoinOptions> {
  const communities = await prisma.community.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      buildings: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, apartments: { orderBy: { number: "asc" }, select: { id: true, number: true } } },
      },
    },
  });
  const rows = await prisma.joinRequest.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    include: { building: true, apartment: true },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.communityId)) latest.set(r.communityId, r);
  return {
    communities,
    requests: [...latest.values()].map((r) => ({
      id: r.id,
      communityId: r.communityId,
      status: r.status,
      buildingName: r.building.name,
      apartmentNumber: r.apartment.number,
      kind: r.kind,
      createdAt: r.createdAt,
      rejectReason: r.rejectReason,
    })),
  };
}

export async function createJoinRequest(
  actor: SessionUser,
  input: { communityId: string; buildingId: string; apartmentId: string; kind: ResidencyKind; note?: string },
): Promise<JoinRequest> {
  if (input.kind !== "OWNER" && input.kind !== "TENANT") throw new ValidationError("invalid residency kind");
  if (actor.memberships.some((m) => m.communityId === input.communityId)) {
    throw new ValidationError("already a member of this community");
  }
  const note = cleanText(input.note);
  const apartment = await prisma.apartment.findUnique({ where: { id: input.apartmentId }, include: { building: true } });
  if (!apartment || apartment.buildingId !== input.buildingId || apartment.building.communityId !== input.communityId) {
    throw new TenantMismatchError(`Apartment ${input.apartmentId} is not in building ${input.buildingId}`);
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const open = await tx.joinRequest.findFirst({ where: { userId: actor.id, communityId: input.communityId, status: JoinRequestStatus.PENDING } });
      if (open) throw new ValidationError("a pending request already exists");
      const request = await tx.joinRequest.create({
        data: { userId: actor.id, communityId: input.communityId, buildingId: input.buildingId, apartmentId: input.apartmentId, kind: input.kind, note },
      });
      await writeAuditLog(tx, {
        communityId: input.communityId,
        userId: actor.id,
        action: "JOIN_REQUEST_CREATED",
        entity: "JoinRequest",
        entityId: request.id,
      });
      await notify(tx, {
        communityId: input.communityId,
        type: "JOIN_REQUEST_CREATED",
        recipientUserIds: await approverIds(tx, input.communityId),
        payload: {
          requestId: request.id,
          name: displayName(actor) ?? actor.email,
          buildingName: apartment.building.name,
          apartmentNumber: apartment.number,
        },
        dedupeKey: `JOIN_REQUEST_CREATED:${request.id}`,
      });
      return request;
    });
  } catch (e) {
    // Concurrent double submit loses on the JoinRequest_one_pending partial unique index.
    // Structural check: instanceof breaks when Next loads Prisma twice (see domain/engagement/reactions.ts).
    if ((e as { code?: unknown } | null)?.code === "P2002") throw new ValidationError("a pending request already exists");
    throw e;
  }
}

export async function cancelJoinRequest(actor: SessionUser, requestId: string): Promise<void> {
  const res = await prisma.joinRequest.updateMany({
    where: { id: requestId, userId: actor.id, status: JoinRequestStatus.PENDING },
    data: { status: JoinRequestStatus.CANCELLED },
  });
  if (res.count === 0) throw new NotFoundError(`Pending request ${requestId} not found`);
}

const viewInclude = {
  user: { select: { email: true, firstName: true, lastName: true } },
  building: { select: { id: true, name: true } },
  apartment: { select: { id: true, number: true } },
} satisfies Prisma.JoinRequestInclude;

export type JoinRequestView = {
  id: string;
  status: JoinRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
  note: string | null;
  rejectReason: string | null;
  kind: ResidencyKind;
  user: { email: string; name: string | null };
  building: { id: string; name: string };
  apartment: { id: string; number: string };
};

const toView = (r: Prisma.JoinRequestGetPayload<{ include: typeof viewInclude }>): JoinRequestView => ({
  id: r.id,
  status: r.status,
  createdAt: r.createdAt,
  decidedAt: r.decidedAt,
  note: r.note,
  rejectReason: r.rejectReason,
  kind: r.kind,
  user: { email: r.user.email, name: displayName(r.user) },
  building: r.building,
  apartment: r.apartment,
});

export async function listJoinRequests(actor: SessionUser, communityId: string) {
  await requireApprover(actor, communityId);
  const [pending, decided] = await Promise.all([
    prisma.joinRequest.findMany({ where: { communityId, status: JoinRequestStatus.PENDING }, include: viewInclude, orderBy: { createdAt: "asc" } }),
    prisma.joinRequest.findMany({
      where: { communityId, status: { in: [JoinRequestStatus.APPROVED, JoinRequestStatus.REJECTED] } },
      include: viewInclude,
      orderBy: { decidedAt: "desc" },
      take: 20,
    }),
  ]);
  return { pending: pending.map(toView), decided: decided.map(toView) };
}

export async function listUsersWithoutRequest(actor: SessionUser, communityId: string) {
  await requireApprover(actor, communityId);
  return prisma.user.findMany({
    where: {
      memberships: { none: {} },
      joinRequests: { none: { status: JoinRequestStatus.PENDING } },
      NOT: { clerkUserId: { startsWith: "pending:" } },
    },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function setReceptionCanApprove(actor: SessionUser, communityId: string, value: boolean) {
  const membership = actor.memberships.find((m) => m.communityId === communityId);
  if (!membership || !MANAGERS.includes(membership.role)) {
    throw new UnauthorizedError(`User ${actor.id} cannot change community settings`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { receptionCanApproveJoinRequests: value } });
    await writeAuditLog(tx, {
      communityId,
      userId: actor.id,
      action: "COMMUNITY_SETTINGS_CHANGED",
      entity: "Community",
      entityId: communityId,
      metadata: { receptionCanApproveJoinRequests: value },
    });
  });
}

async function loadRequest(requestId: string) {
  const req = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: { user: true, community: true },
  });
  if (!req) throw new NotFoundError(`Join request ${requestId} not found`);
  return req;
}

async function emailDecision(user: { email: string; locale: string | null }, approved: boolean, communityName: string, reason?: string | null) {
  const mail = decisionEmail(user.locale, { approved, communityName, reason });
  const res = await sendEmail({ to: user.email, ...mail });
  if (!res.ok) console.error("join request decision email failed", res.error);
}

export async function approveJoinRequest(
  actor: SessionUser,
  requestId: string,
  overrides?: { buildingId: string; apartmentId: string; kind: ResidencyKind },
): Promise<void> {
  const req = await loadRequest(requestId);
  await requireApprover(actor, req.communityId);
  if (req.status !== JoinRequestStatus.PENDING) throw new ValidationError("request is not pending");
  const target = overrides ?? { buildingId: req.buildingId, apartmentId: req.apartmentId, kind: req.kind };
  if (target.kind !== "OWNER" && target.kind !== "TENANT") throw new ValidationError("invalid residency kind");

  try {
    await prisma.$transaction(async (tx) => {
      const apartment = await tx.apartment.findUnique({ where: { id: target.apartmentId }, include: { building: true } });
      if (!apartment || apartment.buildingId !== target.buildingId || apartment.building.communityId !== req.communityId) {
        throw new TenantMismatchError(`Apartment ${target.apartmentId} is not in building ${target.buildingId}`);
      }
      // Claim the request first: a concurrent approval blocks on this row lock, re-checks PENDING and loses
      // with a clean ValidationError instead of a unique violation on the membership. Any later failure rolls the claim back.
      const claimed = await tx.joinRequest.updateMany({
        where: { id: req.id, status: JoinRequestStatus.PENDING },
        data: { status: JoinRequestStatus.APPROVED, decidedById: actor.id, decidedAt: new Date(), buildingId: target.buildingId, apartmentId: target.apartmentId, kind: target.kind },
      });
      if (claimed.count === 0) throw new ValidationError("request is not pending");
      const existing = await tx.membership.findUnique({ where: { userId_communityId: { userId: req.userId, communityId: req.communityId } } });
      if (existing) throw new ValidationError("user is already a member");
      await tx.membership.create({ data: { userId: req.userId, communityId: req.communityId, buildingId: target.buildingId, role: Role.RESIDENT } });
      await tx.apartmentResidency.create({
        data: { userId: req.userId, apartmentId: target.apartmentId, communityId: req.communityId, kind: target.kind },
      });
      await writeAuditLog(tx, { communityId: req.communityId, userId: actor.id, action: "JOIN_REQUEST_APPROVED", entity: "JoinRequest", entityId: req.id, metadata: target });
      await notify(tx, {
        communityId: req.communityId,
        type: "JOIN_REQUEST_APPROVED",
        recipientUserIds: [req.userId],
        payload: { requestId: req.id, communityName: req.community.name },
        dedupeKey: `JOIN_REQUEST_APPROVED:${req.id}`,
      });
    });
  } catch (e) {
    // Structural check (see createJoinRequest): a unique violation here means a concurrent decision won.
    if ((e as { code?: unknown } | null)?.code === "P2002") throw new ValidationError("request is not pending");
    throw e;
  }
  await emailDecision(req.user, true, req.community.name);
}

export async function rejectJoinRequest(actor: SessionUser, requestId: string, reason?: string): Promise<void> {
  const req = await loadRequest(requestId);
  await requireApprover(actor, req.communityId);
  const rejectReason = cleanText(reason);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.joinRequest.updateMany({
      where: { id: req.id, status: JoinRequestStatus.PENDING },
      data: { status: JoinRequestStatus.REJECTED, decidedById: actor.id, decidedAt: new Date(), rejectReason },
    });
    if (updated.count === 0) throw new ValidationError("request is not pending");
    await writeAuditLog(tx, { communityId: req.communityId, userId: actor.id, action: "JOIN_REQUEST_REJECTED", entity: "JoinRequest", entityId: req.id });
    await notify(tx, {
      communityId: req.communityId,
      type: "JOIN_REQUEST_REJECTED",
      recipientUserIds: [req.userId],
      payload: { requestId: req.id, communityName: req.community.name, reason: rejectReason ?? "" },
      dedupeKey: `JOIN_REQUEST_REJECTED:${req.id}`,
    });
  });
  await emailDecision(req.user, false, req.community.name, rejectReason);
}
