import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import type { SessionUser } from "@/auth/session";
import { TenantMismatchError, UnauthorizedError, ValidationError } from "@/domain/errors";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import {
  cancelJoinRequest,
  createJoinRequest,
  getJoinOptions,
  listJoinRequests,
  listUsersWithoutRequest,
  setReceptionCanApprove,
} from "@/domain/join-requests";

afterEach(async () => {
  await cleanupDatabase();
});

async function newcomer(email = `new-${Date.now()}-${Math.random()}@example.com`): Promise<SessionUser> {
  const user = await prisma.user.create({ data: { email, clerkUserId: `clerk_${email}` } });
  return { ...user, memberships: [], residencies: [] };
}

async function setup() {
  const base = await createCommunityWithBuildingAndApartment();
  const manager = await createUserWithMembership({ communityId: base.community.id, role: Role.MANAGER });
  const reception = await createUserWithMembership({ communityId: base.community.id, role: Role.RECEPTIONIST });
  const resident = await createUserWithMembership({
    communityId: base.community.id,
    buildingId: base.building.id,
    apartmentId: base.apartment.id,
    role: Role.RESIDENT,
  });
  const input = { communityId: base.community.id, buildingId: base.building.id, apartmentId: base.apartment.id, kind: "OWNER" as const };
  return { ...base, manager, reception, resident, input };
}

describe("createJoinRequest", () => {
  it("creates a pending request and notifies managers/admins only (reception when allowed)", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, { ...s.input, note: "  kupiłam w październiku  " });
    expect(req.status).toBe("PENDING");
    expect(req.note).toBe("kupiłam w październiku");
    let recipients = (await prisma.notification.findMany({ where: { type: "JOIN_REQUEST_CREATED" } })).map((n) => n.recipientUserId);
    expect(recipients).toEqual([s.manager.id]);

    await setReceptionCanApprove(s.manager, s.community.id, true);
    await cancelJoinRequest(me, req.id);
    await createJoinRequest(me, s.input);
    recipients = (await prisma.notification.findMany({ where: { type: "JOIN_REQUEST_CREATED" } })).map((n) => n.recipientUserId).sort();
    expect(recipients).toEqual([s.manager.id, s.manager.id, s.reception.id].sort());
  });

  it("rejects a second pending request, a member, a too long note and mismatched apartments", async () => {
    const s = await setup();
    const me = await newcomer();
    await createJoinRequest(me, s.input);
    await expect(createJoinRequest(me, s.input)).rejects.toThrow(ValidationError);
    await expect(createJoinRequest(s.resident, s.input)).rejects.toThrow(ValidationError);
    const other = await newcomer();
    await expect(createJoinRequest(other, { ...s.input, note: "x".repeat(501) })).rejects.toThrow(ValidationError);
    const elsewhere = await createCommunityWithBuildingAndApartment();
    await expect(createJoinRequest(other, { ...s.input, apartmentId: elsewhere.apartment.id })).rejects.toThrow(TenantMismatchError);
    // a valid building+apartment of community B submitted with community A's id
    await expect(
      createJoinRequest(other, {
        communityId: s.community.id,
        buildingId: elsewhere.building.id,
        apartmentId: elsewhere.apartment.id,
        kind: "OWNER",
      }),
    ).rejects.toThrow(TenantMismatchError);
  });

  it("rejects an invalid residency kind", async () => {
    const s = await setup();
    const me = await newcomer();
    await expect(createJoinRequest(me, { ...s.input, kind: "SQUATTER" as never })).rejects.toThrow(ValidationError);
    expect(await prisma.joinRequest.count()).toBe(0);
  });

  it("maps a concurrent double submit to a ValidationError and keeps one pending row", async () => {
    const s = await setup();
    const me = await newcomer();
    const results = await Promise.allSettled([createJoinRequest(me, s.input), createJoinRequest(me, s.input)]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ValidationError);
    expect(await prisma.joinRequest.count({ where: { userId: me.id, status: "PENDING" } })).toBe(1);
  });

  it("writes one audit row per request", async () => {
    const s = await setup();
    await createJoinRequest(await newcomer(), s.input);
    expect(await prisma.auditLog.count({ where: { action: "JOIN_REQUEST_CREATED" } })).toBe(1);
  });
});

describe("cancelJoinRequest", () => {
  it("cancels only the requester's own pending request", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await expect(cancelJoinRequest(await newcomer(), req.id)).rejects.toThrow();
    await cancelJoinRequest(me, req.id);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
  });
});

describe("listing", () => {
  it("lists pending requests for approvers and users without a request from our DB", async () => {
    const s = await setup();
    const withRequest = await newcomer("with@example.com");
    const without = await newcomer("without@example.com");
    await createJoinRequest(withRequest, s.input);

    const { pending } = await listJoinRequests(s.manager, s.community.id);
    expect(pending.map((r) => r.user.email)).toEqual(["with@example.com"]);
    const loose = await listUsersWithoutRequest(s.manager, s.community.id);
    expect(loose.map((u) => u.email)).toContain(without.email);
    expect(loose.map((u) => u.email)).not.toContain(withRequest.email);
    expect(loose.map((u) => u.email)).not.toContain(s.resident.email);

    await expect(listJoinRequests(s.reception, s.community.id)).rejects.toThrow(UnauthorizedError);
    await expect(listJoinRequests(s.resident, s.community.id)).rejects.toThrow(UnauthorizedError);
    await setReceptionCanApprove(s.manager, s.community.id, true);
    expect((await listJoinRequests(s.reception, s.community.id)).pending).toHaveLength(1);
  });

  it("excludes pending: placeholder users from the users-without-request list", async () => {
    const s = await setup();
    await prisma.user.create({ data: { email: "placeholder@example.com", clerkUserId: "pending:placeholder@example.com" } });
    const real = await newcomer("real@example.com");
    const emails = (await listUsersWithoutRequest(s.manager, s.community.id)).map((u) => u.email);
    expect(emails).toContain(real.email);
    expect(emails).not.toContain("placeholder@example.com");
  });

  it("refuses a manager of a different community", async () => {
    const s = await setup();
    const otherBase = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: otherBase.community.id, role: Role.MANAGER });
    await expect(listJoinRequests(outsider, s.community.id)).rejects.toThrow(UnauthorizedError);
    await expect(listUsersWithoutRequest(outsider, s.community.id)).rejects.toThrow(UnauthorizedError);
    await expect(setReceptionCanApprove(outsider, s.community.id, true)).rejects.toThrow(UnauthorizedError);
  });

  it("only managers/admins change the reception setting", async () => {
    const s = await setup();
    await expect(setReceptionCanApprove(s.reception, s.community.id, true)).rejects.toThrow(UnauthorizedError);
    expect(await prisma.auditLog.count({ where: { action: "COMMUNITY_SETTINGS_CHANGED" } })).toBe(0);

    await setReceptionCanApprove(s.manager, s.community.id, true);
    const rows = await prisma.auditLog.findMany({ where: { action: "COMMUNITY_SETTINGS_CHANGED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ receptionCanApproveJoinRequests: true });
  });

  it("gives a newcomer the community's buildings/apartments and their latest request", async () => {
    const s = await setup();
    const me = await newcomer();
    let opts = await getJoinOptions(me);
    expect(opts.communities[0].buildings[0].apartments.map((a) => a.id)).toContain(s.apartment.id);
    expect(opts.requests).toEqual([]);
    await createJoinRequest(me, s.input);
    opts = await getJoinOptions(me);
    expect(opts.requests[0]).toMatchObject({ status: "PENDING", apartmentNumber: "101", kind: "OWNER" });
  });
});
