import type { PackageStatus, ReportStatus } from "@/lib/generated/prisma";

const LIST_LIMIT = 3;
const OPEN_STATUSES: ReportStatus[] = ["NEW", "IN_PROGRESS"];

export function summarizeDashboard<
  P extends { status: PackageStatus; receivedAt: Date },
  R extends { status: ReportStatus; urgent: boolean; authorId: string; createdAt: Date },
>(input: { userId: string; packages: P[]; reports: R[] }) {
  const waiting = input.packages
    .filter((p) => p.status !== "PICKED_UP")
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

  const mine = input.reports
    .filter((r) => r.authorId === input.userId && OPEN_STATUSES.includes(r.status))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    waitingPackages: waiting.slice(0, LIST_LIMIT),
    waitingPackageCount: waiting.length,
    myOpenReports: mine.slice(0, LIST_LIMIT),
    myOpenReportCount: mine.length,
    newReportCount: input.reports.filter((r) => r.status === "NEW").length,
    urgentReportCount: input.reports.filter((r) => r.urgent && OPEN_STATUSES.includes(r.status)).length,
  };
}
