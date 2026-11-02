import { afterEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/lib/generated/prisma";
import {
  cleanupDatabase,
  createCommunityWithBuildingAndApartment,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";

const getUserList = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUserList } }),
}));

import { listUnassignedClerkEmails } from "@/domain/memberships/unassigned";

const clerkUser = (email: string) => ({
  primaryEmailAddress: { emailAddress: email },
  emailAddresses: [{ emailAddress: email }],
});

afterEach(async () => {
  getUserList.mockReset();
  await cleanupDatabase();
});

describe("listUnassignedClerkEmails", () => {
  it("asks Clerk for at most 25 newest users", async () => {
    getUserList.mockResolvedValue({ data: [] });

    await listUnassignedClerkEmails();

    expect(getUserList).toHaveBeenCalledWith({ limit: 25, orderBy: "-created_at" });
  });

  it("returns all 25 fetched emails when nobody is assigned", async () => {
    const emails = Array.from({ length: 25 }, (_, i) => `new${i}@example.com`);
    getUserList.mockResolvedValue({ data: emails.map(clerkUser) });

    expect(await listUnassignedClerkEmails()).toEqual(emails);
  });

  it("omits users that already have a membership", async () => {
    const { community } = await createCommunityWithBuildingAndApartment();
    await createUserWithMembership({
      communityId: community.id,
      role: Role.ADMIN,
      email: "assigned@example.com",
    });
    getUserList.mockResolvedValue({
      data: [clerkUser("assigned@example.com"), clerkUser("waiting@example.com")],
    });

    expect(await listUnassignedClerkEmails()).toEqual(["waiting@example.com"]);
  });

  it("skips Clerk users without an email", async () => {
    getUserList.mockResolvedValue({
      data: [{ primaryEmailAddress: null, emailAddresses: [] }, clerkUser("a@example.com")],
    });

    expect(await listUnassignedClerkEmails()).toEqual(["a@example.com"]);
  });
});
