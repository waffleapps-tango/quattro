import { describe, expect, it } from "vitest";
import { canTransition, nextStatuses } from "@/domain/reports/transitions";

describe("canTransition", () => {
  it("DEFECT and COMPLAINT go NEW → IN_PROGRESS → RESOLVED", () => {
    for (const type of ["DEFECT", "COMPLAINT"] as const) {
      expect(canTransition(type, "NEW", "IN_PROGRESS")).toBe(true);
      expect(canTransition(type, "IN_PROGRESS", "RESOLVED")).toBe(true);
      expect(canTransition(type, "NEW", "RESOLVED")).toBe(false);
      expect(canTransition(type, "NEW", "CLOSED")).toBe(false);
    }
  });

  it("REQUEST goes NEW → APPROVED | REJECTED", () => {
    expect(canTransition("REQUEST", "NEW", "APPROVED")).toBe(true);
    expect(canTransition("REQUEST", "NEW", "REJECTED")).toBe(true);
    expect(canTransition("REQUEST", "NEW", "IN_PROGRESS")).toBe(false);
  });

  it("NOTICE, QUESTION and IDEA go NEW → CLOSED", () => {
    for (const type of ["NOTICE", "QUESTION", "IDEA"] as const) {
      expect(canTransition(type, "NEW", "CLOSED")).toBe(true);
      expect(canTransition(type, "NEW", "RESOLVED")).toBe(false);
    }
  });

  it("final statuses have no way out", () => {
    expect(canTransition("DEFECT", "RESOLVED", "IN_PROGRESS")).toBe(false);
    expect(nextStatuses("REQUEST", "APPROVED")).toEqual([]);
  });

  it("lists the next statuses", () => {
    expect(nextStatuses("REQUEST", "NEW")).toEqual(["APPROVED", "REJECTED"]);
    expect(nextStatuses("DEFECT", "NEW")).toEqual(["IN_PROGRESS"]);
  });
});
