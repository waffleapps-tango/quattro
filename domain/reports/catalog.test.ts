import { describe, expect, it } from "vitest";
import { CATEGORIES, getCategory } from "@/domain/reports/catalog";

describe("catalog", () => {
  it("has unique keys", () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every category allows at least one type", () => {
    for (const c of CATEGORIES) expect(c.types.length, c.key).toBeGreaterThan(0);
  });

  it("parking, storage and apartment subjects are always PRIVATE", () => {
    for (const c of CATEGORIES.filter((c) => c.subject !== "none")) {
      expect(c.visibility, c.key).toBe("PRIVATE");
    }
  });

  it("neighbour complaints are private COMPLAINTs", () => {
    const c = getCategory("neighbours");
    expect(c?.visibility).toBe("PRIVATE");
    expect(c?.types).toEqual(["COMPLAINT"]);
  });

  it("looks categories up by key", () => {
    expect(getCategory("own-parking")?.subject).toBe("parking");
    expect(getCategory("nope")).toBeUndefined();
  });
});
