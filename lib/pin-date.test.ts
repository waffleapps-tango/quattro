import { describe, expect, it } from "vitest";
import { endOfPinDay } from "@/lib/pin-date";

describe("endOfPinDay", () => {
  it("converts a date to the end of that day in Poland (+01:00)", () => {
    expect(endOfPinDay("2026-07-13")!.toISOString()).toBe("2026-07-13T22:59:59.000Z");
    expect(endOfPinDay("2026-01-13")!.toISOString()).toBe("2026-01-13T22:59:59.000Z");
  });
  it("returns null without a date", () => {
    expect(endOfPinDay(undefined)).toBeNull();
  });
  it("round-trips through the edit form's toISOString().slice(0, 10)", () => {
    expect(endOfPinDay("2026-07-13")!.toISOString().slice(0, 10)).toBe("2026-07-13");
  });
});
