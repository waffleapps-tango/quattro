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
import { sendEmail } from "@/lib/email";
import { decisionEmail, inviteEmail } from "@/domain/join-requests/emails";
import {
  approveJoinRequest,
  cancelJoinRequest,
  createJoinRequest,
  getJoinOptions,
  listJoinRequests,
  listUsersWithoutRequest,
  rejectJoinRequest,
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

describe("approve / reject", () => {
  it("approves into a resident membership + residency atomically and tells the requester", async () => {
    const s = await setup();
    const me = await newcomer();
    await prisma.notificationPreference.create({ data: { userId: me.id, emailEnabled: true, smsEnabled: true, phone: "+48123456789" } });
    const req = await createJoinRequest(me, { ...s.input, kind: "TENANT" });
    await approveJoinRequest(s.manager, req.id);

    const membership = await prisma.membership.findUniqueOrThrow({ where: { userId_communityId: { userId: me.id, communityId: s.community.id } } });
    expect(membership).toMatchObject({ role: "RESIDENT", buildingId: s.building.id });
    const residency = await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: me.id } });
    expect(residency).toMatchObject({ apartmentId: s.apartment.id, kind: "TENANT" });
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
    expect(await prisma.notification.count({ where: { type: "JOIN_REQUEST_APPROVED", recipientUserId: me.id } })).toBe(1);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ to: me.email }));
    // the dedicated decision email replaces the preference-driven email/SMS
    const deliveries = await prisma.notificationDelivery.findMany({ where: { notification: { type: "JOIN_REQUEST_APPROVED", recipientUserId: me.id } } });
    expect(deliveries.map((d) => d.channel)).toEqual(["in-app"]);
  });

  it("applies overrides from 'edit and approve'", async () => {
    const s = await setup();
    const other = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "102" } });
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await approveJoinRequest(s.manager, req.id, { buildingId: s.building.id, apartmentId: other.id, kind: "TENANT" });
    expect(await prisma.apartmentResidency.findFirstOrThrow({ where: { userId: me.id } })).toMatchObject({ apartmentId: other.id, kind: "TENANT" });
    expect(await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: "APPROVED", apartmentId: other.id, kind: "TENANT" });
  });

  it("refuses overrides pointing at another community's apartment and writes nothing", async () => {
    const s = await setup();
    const elsewhere = await createCommunityWithBuildingAndApartment();
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await expect(
      approveJoinRequest(s.manager, req.id, { buildingId: elsewhere.building.id, apartmentId: elsewhere.apartment.id, kind: "OWNER" }),
    ).rejects.toThrow(TenantMismatchError);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
    expect(await prisma.membership.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.apartmentResidency.count({ where: { userId: me.id } })).toBe(0);
  });

  it("refuses an invalid override kind", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await expect(
      approveJoinRequest(s.manager, req.id, { buildingId: s.building.id, apartmentId: s.apartment.id, kind: "SQUATTER" as never }),
    ).rejects.toThrow(ValidationError);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
    expect(await prisma.membership.count({ where: { userId: me.id } })).toBe(0);
  });

  it("enforces who may decide", async () => {
    const s = await setup();
    const me = await newcomer();
    await prisma.notificationPreference.create({ data: { userId: me.id, emailEnabled: true, smsEnabled: true, phone: "+48123456789" } });
    const req = await createJoinRequest(me, s.input);
    await expect(approveJoinRequest(s.reception, req.id)).rejects.toThrow(UnauthorizedError);
    await expect(approveJoinRequest(s.resident, req.id)).rejects.toThrow(UnauthorizedError);
    const elsewhere = await createCommunityWithBuildingAndApartment();
    const outsider = await createUserWithMembership({ communityId: elsewhere.community.id, role: Role.MANAGER });
    await expect(approveJoinRequest(outsider, req.id)).rejects.toThrow(UnauthorizedError);
    await expect(rejectJoinRequest(outsider, req.id)).rejects.toThrow(UnauthorizedError);
    await setReceptionCanApprove(s.manager, s.community.id, true);
    await rejectJoinRequest(s.reception, req.id, "  nie znamy tej osoby ");
    const stored = await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(stored).toMatchObject({ status: "REJECTED", rejectReason: "nie znamy tej osoby", decidedById: s.reception.id });
    expect(await prisma.notification.count({ where: { type: "JOIN_REQUEST_REJECTED", recipientUserId: me.id } })).toBe(1);
    const deliveries = await prisma.notificationDelivery.findMany({ where: { notification: { type: "JOIN_REQUEST_REJECTED", recipientUserId: me.id } } });
    expect(deliveries.map((d) => d.channel)).toEqual(["in-app"]);
  });

  it("only decides a pending request, once", async () => {
    const s = await setup();
    const me = await newcomer();
    const rejected = await createJoinRequest(me, s.input);
    await rejectJoinRequest(s.manager, rejected.id);
    await expect(approveJoinRequest(s.manager, rejected.id)).rejects.toThrow(ValidationError);
    expect(await prisma.membership.count({ where: { userId: me.id } })).toBe(0);

    const approved = await createJoinRequest(me, s.input);
    await approveJoinRequest(s.manager, approved.id);
    await expect(rejectJoinRequest(s.manager, approved.id)).rejects.toThrow(ValidationError);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: approved.id } })).status).toBe("APPROVED");

    const other = await newcomer();
    const cancelled = await createJoinRequest(other, s.input);
    await cancelJoinRequest(other, cancelled.id);
    await expect(approveJoinRequest(s.manager, cancelled.id)).rejects.toThrow(ValidationError);
    await expect(rejectJoinRequest(s.manager, cancelled.id)).rejects.toThrow(ValidationError);
    expect(await prisma.membership.count({ where: { userId: other.id } })).toBe(0);
    expect(await prisma.apartmentResidency.count({ where: { userId: other.id } })).toBe(0);
  });

  it("lets only one of two concurrent approvals win, with a clean ValidationError for the other", async () => {
    const s = await setup();
    const second = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    const results = await Promise.allSettled([approveJoinRequest(s.manager, req.id), approveJoinRequest(second, req.id)]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ValidationError);
    expect(await prisma.membership.count({ where: { userId: me.id } })).toBe(1);
    expect(await prisma.apartmentResidency.count({ where: { userId: me.id } })).toBe(1);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
  });

  it("leaves the request pending when the user became a member meanwhile", async () => {
    const s = await setup();
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await prisma.membership.create({ data: { userId: me.id, communityId: s.community.id, role: Role.RESIDENT } });
    await expect(approveJoinRequest(s.manager, req.id)).rejects.toThrow(ValidationError);
    const stored = await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(stored).toMatchObject({ status: "PENDING", decidedById: null, decidedAt: null });
    expect(await prisma.apartmentResidency.count({ where: { userId: me.id } })).toBe(0);
  });

  it("does not fail the decision when the email fails", async () => {
    const s = await setup();
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, error: "down", retry: true });
    const me = await newcomer();
    const req = await createJoinRequest(me, s.input);
    await approveJoinRequest(s.manager, req.id);
    expect((await prisma.joinRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
  });
});

describe("decision / invite emails", () => {
  it("render in pl and en with the community name and the encoded sign-up url", () => {
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.com/";
    try {
      for (const locale of ["pl", "en"]) {
        for (const approved of [true, false]) {
          const mail = decisionEmail(locale, { approved, communityName: "Osiedle Słoneczne", reason: "brak danych" });
          expect(mail.subject).toContain("Osiedle Słoneczne");
          expect(mail.text).toContain("https://app.example.com");
          if (!approved) expect(mail.text).toContain("brak danych");
        }
        const invite = inviteEmail(locale, { email: "a+b@example.com", communityName: "Osiedle Słoneczne", place: "Budynek A, m. 12" });
        expect(invite.subject).toContain("Osiedle Słoneczne");
        expect(invite.text).toContain("Osiedle Słoneczne");
        expect(invite.text).toContain("Budynek A, m. 12");
        expect(invite.text).toContain("https://app.example.com/sign-up?email=a%2Bb%40example.com");
        expect(inviteEmail(locale, { email: "a@example.com", communityName: "X", place: "" }).text).not.toMatch(/\n{3,}/);
      }
      expect(decisionEmail("en", { approved: false, communityName: "X" }).text).not.toMatch(/ \n/);
      expect(decisionEmail("pl", { approved: true, communityName: "X" }).subject).toMatch(/dostęp/);
      expect(decisionEmail("en", { approved: true, communityName: "X" }).subject).toMatch(/access/);
      expect(decisionEmail(null, { approved: true, communityName: "X" }).subject).toMatch(/dostęp/);
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
  });
});
