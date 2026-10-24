import { describe, expect, it } from "vitest";
import { residentApartmentIds, type SessionUser } from "@/auth/session";

const user = (residencies: { communityId: string; apartmentId: string }[]) =>
  ({ residencies }) as unknown as SessionUser;

describe("residentApartmentIds", () => {
  it("returns the apartment ids of the given community only", () => {
    const u = user([
      { communityId: "c1", apartmentId: "a1" },
      { communityId: "c1", apartmentId: "a2" },
      { communityId: "c2", apartmentId: "a3" },
    ]);
    expect(residentApartmentIds(u, "c1")).toEqual(["a1", "a2"]);
    expect(residentApartmentIds(u, "c2")).toEqual(["a3"]);
  });

  it("returns an empty list when the user has no residencies there", () => {
    expect(residentApartmentIds(user([]), "c1")).toEqual([]);
  });
});
