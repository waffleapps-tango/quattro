import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import { sendEmail } from "@/lib/email";
import { UnauthorizedError } from "@/domain/errors";
import { cleanupDatabase, createCommunityWithBuildingAndApartment, createUserWithMembership } from "@/domain/__test-helpers__/fixtures";
import { inviteToApartment, setReceptionCanInvite } from "@/domain/memberships/invites";
import { listApartmentOverview } from "@/domain/residencies/overview";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://app.example.com");
});
afterEach(async () => {
  await cleanupDatabase();
  vi.mocked(sendEmail).mockClear();
  vi.unstubAllEnvs();
});

async function scenario() {
  const s = await createCommunityWithBuildingAndApartment();
  const empty = await prisma.apartment.create({ data: { buildingId: s.building.id, number: "102" } });
  const manager = await createUserWithMembership({ communityId: s.community.id, role: Role.MANAGER });
  const reception = await createUserWithMembership({ communityId: s.community.id, role: Role.RECEPTIONIST });
  return { ...s, empty, manager, reception };
}

describe("listApartmentOverview", () => {
  it("lists flats, marks vacant ones and masks residents who hid their name", async () => {
    const s = await scenario();
    const hidden = await createUserWithMembership({ communityId: s.community.id, apartmentId: s.apartment.id, role: Role.RESIDENT, email: "secret@example.com" });
    await prisma.user.update({ where: { id: hidden.id }, data: { firstName: "Jan", lastName: "Tajny", shareName: false } });

    const [building] = await listApartmentOverview(s.manager, s.community.id);
    const flat = building.apartments.find((a) => a.number === "101")!;
    expect(flat.residents).toHaveLength(1);
    expect(flat.residents[0].name).toBe("Mieszkaniec Building A / 101");
    expect(JSON.stringify(building)).not.toContain("secret@example.com");
    expect(building.apartments.find((a) => a.number === "102")!.residents).toEqual([]);
  });

  it("is closed to reception until the community enables it", async () => {
    const s = await scenario();
    await expect(listApartmentOverview(s.reception, s.community.id)).rejects.toThrow(UnauthorizedError);
    await setReceptionCanInvite(s.manager, s.community.id, true);
    await expect(listApartmentOverview(s.reception, s.community.id)).resolves.toHaveLength(1);
  });
});

describe("inviteToApartment", () => {
  it("links the invitee, shows them as pending and emails them", async () => {
    const s = await scenario();
    await setReceptionCanInvite(s.manager, s.community.id, true);
    const res = await inviteToApartment(s.reception, { communityId: s.community.id, apartmentId: s.empty.id, email: "new@example.com", kind: "TENANT" });
    expect(res).toEqual({ sent: true });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ to: "new@example.com" }));
    const [building] = await listApartmentOverview(s.manager, s.community.id);
    const r = building.apartments.find((a) => a.number === "102")!.residents[0];
    expect(r).toMatchObject({ name: "new@example.com", kind: "TENANT", pending: true });
  });

  it("rejects reception while the switch is off, and residents always", async () => {
    const s = await scenario();
    const input = { communityId: s.community.id, apartmentId: s.empty.id, email: "x@example.com", kind: "OWNER" as const };
    await expect(inviteToApartment(s.reception, input)).rejects.toThrow(UnauthorizedError);
    const resident = await createUserWithMembership({ communityId: s.community.id, role: Role.RESIDENT });
    await expect(inviteToApartment(resident, input)).rejects.toThrow(UnauthorizedError);
  });

  it("keeps the link when the email fails", async () => {
    const s = await scenario();
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, error: "down", retry: true });
    const res = await inviteToApartment(s.manager, { communityId: s.community.id, apartmentId: s.empty.id, email: "y@example.com", kind: "OWNER" });
    expect(res).toEqual({ sent: false });
    expect(await prisma.apartmentResidency.count({ where: { apartmentId: s.empty.id } })).toBe(1);
  });

  it("only managers may change the switch", async () => {
    const s = await scenario();
    await expect(setReceptionCanInvite(s.reception, s.community.id, true)).rejects.toThrow(UnauthorizedError);
  });
});
