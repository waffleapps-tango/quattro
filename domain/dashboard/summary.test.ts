import { describe, expect, it } from "vitest";
import { summarizeDashboard } from "@/domain/dashboard/summary";

const d = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00Z`);

const pkg = (id: string, status: "RECEIVED" | "READY_FOR_PICKUP" | "PICKED_UP", day: number) => ({
  id,
  status,
  receivedAt: d(day),
});

const rep = (
  id: string,
  authorId: string,
  status: "NEW" | "IN_PROGRESS" | "RESOLVED" | "APPROVED" | "REJECTED" | "CLOSED",
  urgent: boolean,
  day: number,
) => ({ id, authorId, status, urgent, createdAt: d(day) });

describe("summarizeDashboard", () => {
  it("counts waiting packages and keeps the newest three first", () => {
    const result = summarizeDashboard({
      userId: "u1",
      packages: [
        pkg("a", "RECEIVED", 1),
        pkg("b", "PICKED_UP", 2),
        pkg("c", "READY_FOR_PICKUP", 3),
        pkg("d", "RECEIVED", 4),
        pkg("e", "RECEIVED", 5),
      ],
      reports: [],
    });

    expect(result.waitingPackageCount).toBe(4);
    expect(result.waitingPackages.map((p) => p.id)).toEqual(["e", "d", "c"]);
  });

  it("lists only the user's own open reports, newest first", () => {
    const result = summarizeDashboard({
      userId: "u1",
      packages: [],
      reports: [
        rep("r1", "u1", "NEW", false, 1),
        rep("r2", "u2", "NEW", false, 2),
        rep("r3", "u1", "RESOLVED", false, 3),
        rep("r4", "u1", "IN_PROGRESS", false, 4),
      ],
    });

    expect(result.myOpenReportCount).toBe(2);
    expect(result.myOpenReports.map((r) => r.id)).toEqual(["r4", "r1"]);
  });

  it("counts new reports and urgent open reports across all authors", () => {
    const result = summarizeDashboard({
      userId: "u1",
      packages: [],
      reports: [
        rep("r1", "u2", "NEW", true, 1),
        rep("r2", "u3", "IN_PROGRESS", true, 2),
        rep("r3", "u3", "RESOLVED", true, 3),
        rep("r4", "u3", "NEW", false, 4),
      ],
    });

    expect(result.newReportCount).toBe(2);
    expect(result.urgentReportCount).toBe(2);
  });

  it("returns zeros and empty lists for no data", () => {
    expect(summarizeDashboard({ userId: "u1", packages: [], reports: [] })).toEqual({
      waitingPackages: [],
      waitingPackageCount: 0,
      myOpenReports: [],
      myOpenReportCount: 0,
      newReportCount: 0,
      urgentReportCount: 0,
    });
  });
});
