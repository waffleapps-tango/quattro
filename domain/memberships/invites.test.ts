import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { sendEmail } from "@/lib/email";
import { UnauthorizedError, ValidationError } from "@/domain/errors";
import { cleanupDatabase, createCommunityWithBuildingAndApartment, createUserWithMembership } from "@/domain/__test-helpers__/fixtures";
import { createMembership } from "@/domain/memberships";
import { inviteIfPending, sendInvite } from "@/domain/memberships/invites";

afterEach(async () => {
  await cleanupDatabase();
  vi.mocked(sendEmail).mockClear();
});

describe("sendInvite", () => {
  it("emails a pending placeholder, records the time and throttles resends to 10 minutes", async () => {
    const s = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const m = await createMembership(manager, { communityId: s.community.id, email: "invitee@example.com", role: Role.RESIDENT, buildingId: s.building.id });
    expect(await sendInvite(manager, m.id)).toEqual({ sent: true });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ to: "invitee@example.com" }));
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).inviteSentAt).not.toBeNull();
    await expect(sendInvite(manager, m.id)).rejects.toThrow(ValidationError);
    await prisma.membership.update({ where: { id: m.id }, data: { inviteSentAt: new Date(Date.now() - 11 * 60_000) } });
    expect(await sendInvite(manager, m.id)).toEqual({ sent: true });
  });

  it("never emails someone who already has an account, and only managers may send", async () => {
    const s = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const resident = await createUserWithMembership({ communityId: s.community.id, role: Role.RESIDENT });
    const own = await prisma.membership.findFirstOrThrow({ where: { userId: resident.id } });
    await expect(sendInvite(manager, own.id)).rejects.toThrow(ValidationError);
    await expect(sendInvite(resident, own.id)).rejects.toThrow(UnauthorizedError);
  });

  it("reports a failed email without throwing in auto mode and leaves inviteSentAt empty", async () => {
    const s = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const m = await createMembership(manager, { communityId: s.community.id, email: "x@example.com", role: Role.RESIDENT, buildingId: s.building.id });
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, error: "down", retry: true });
    expect(await sendInvite(manager, m.id, { auto: true })).toEqual({ sent: false });
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).inviteSentAt).toBeNull();
  });
});

describe("inviteIfPending", () => {
  it("invites a placeholder, skips real accounts and swallows failures", async () => {
    const s = await createCommunityWithBuildingAndApartment();
    const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
    const real = await createUserWithMembership({ communityId: s.community.id, role: Role.RESIDENT });
    await createMembership(manager, { communityId: s.community.id, email: "new@example.com", role: Role.RESIDENT, buildingId: s.building.id });

    await inviteIfPending(manager, s.community.id, real.email);
    await inviteIfPending(manager, s.community.id, "nobody@example.com");
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();

    await inviteIfPending(manager, s.community.id, "new@example.com");
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);

    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("boom"));
    await prisma.membership.updateMany({ data: { inviteSentAt: null } });
    await expect(inviteIfPending(manager, s.community.id, "new@example.com")).resolves.toBeUndefined();
  });
});
