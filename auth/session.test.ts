import { describe, expect, it } from "vitest";
import { requireMembership, type SessionUser } from "@/auth/session";
import { UnauthorizedError } from "@/domain/errors";
import { Role } from "@/lib/generated/prisma";

function makeUser(memberships: SessionUser["memberships"]): SessionUser {
  return {
    id: "user_1",
    clerkUserId: "clerk_1",
    email: "a@example.com",
    firstName: null,
    lastName: null,
    locale: null,
    createdAt: new Date(),
    memberships,
    residencies: [],
  };
}

describe("requireMembership", () => {
  it("returns the matching membership when the role is allowed", () => {
    const membership = {
      id: "m1",
      userId: "user_1",
      communityId: "community_1",
      buildingId: null,
      apartmentId: null,
      role: Role.ADMIN,
      createdAt: new Date(),
    };
    const user = makeUser([membership]);

    expect(requireMembership(user, "community_1", [Role.ADMIN])).toBe(membership);
  });

  it("throws UnauthorizedError when the user has no membership in that community", () => {
    const user = makeUser([]);

    expect(() => requireMembership(user, "community_1", [Role.ADMIN])).toThrow(
      UnauthorizedError,
    );
  });

  it("throws UnauthorizedError when the role doesn't match", () => {
    const membership = {
      id: "m1",
      userId: "user_1",
      communityId: "community_1",
      buildingId: null,
      apartmentId: null,
      role: Role.RESIDENT,
      createdAt: new Date(),
    };
    const user = makeUser([membership]);

    expect(() =>
      requireMembership(user, "community_1", [Role.ADMIN, Role.MANAGER]),
    ).toThrow(UnauthorizedError);
  });
});
