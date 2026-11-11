import { describe, expect, it } from "vitest";
import { canWritePosts } from "@/domain/posts";
import type { SessionUser } from "@/auth/session";

const userWith = (...roles: string[]) =>
  ({ memberships: roles.map((role) => ({ role })) }) as unknown as SessionUser;

describe("canWritePosts", () => {
  it("allows managers and admins only", () => {
    expect(canWritePosts(userWith("MANAGER"))).toBe(true);
    expect(canWritePosts(userWith("ADMIN"))).toBe(true);
    expect(canWritePosts(userWith("RESIDENT"))).toBe(false);
    expect(canWritePosts(userWith("RECEPTIONIST"))).toBe(false);
    expect(canWritePosts(userWith())).toBe(false);
    expect(canWritePosts(null)).toBe(false);
  });
});
