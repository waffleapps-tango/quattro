import { describe, expect, it } from "vitest";
import { effectiveResidents, livesHere } from "@/domain/residencies/occupancy";

type Link = {
  userId: string;
  kind: "OWNER" | "TENANT";
  livesHereOverride: boolean | null;
  receivesPackages: boolean;
};
const link = (o: Partial<Link> = {}): Link => ({
  userId: "u",
  kind: "OWNER",
  livesHereOverride: null,
  receivesPackages: true,
  ...o,
});

describe("livesHere", () => {
  it("a tenant always lives there", () => {
    expect(livesHere(link({ kind: "TENANT" }), true)).toBe(true);
    expect(livesHere(link({ kind: "TENANT", livesHereOverride: false }), true)).toBe(true);
  });

  it("an owner lives there only while there are no tenants, unless overridden", () => {
    expect(livesHere(link(), false)).toBe(true);
    expect(livesHere(link(), true)).toBe(false);
    expect(livesHere(link({ livesHereOverride: true }), true)).toBe(true);
    expect(livesHere(link({ livesHereOverride: false }), false)).toBe(false);
  });
});

describe("effectiveResidents", () => {
  it("returns the owner alone when there are no tenants", () => {
    const owner = link({ userId: "o" });
    expect(effectiveResidents([owner]).map((l) => l.userId)).toEqual(["o"]);
  });

  it("drops the owner once a tenant exists, unless the owner says they live there too", () => {
    const owner = link({ userId: "o" });
    const tenant = link({ userId: "t", kind: "TENANT" });
    expect(effectiveResidents([owner, tenant]).map((l) => l.userId)).toEqual(["t"]);
    const living = link({ userId: "o", livesHereOverride: true });
    expect(effectiveResidents([living, tenant]).map((l) => l.userId).sort()).toEqual(["o", "t"]);
  });

  it("drops people who opted out of package notifications", () => {
    const optedOut = link({ userId: "x", receivesPackages: false });
    expect(effectiveResidents([optedOut])).toEqual([]);
  });
});
