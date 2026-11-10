import type { ReportStatus } from "@/lib/generated/prisma";

export function statusVariant(status: ReportStatus) {
  switch (status) {
    case "NEW":
      return "warm";
    case "IN_PROGRESS":
      return "info";
    case "REJECTED":
      return "danger";
    default:
      return "secondary";
  }
}
