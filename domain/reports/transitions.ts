import type { ReportStatus, ReportType } from "@/lib/generated/prisma";

type Flow = Partial<Record<ReportStatus, ReportStatus[]>>;

const WORK_FLOW: Flow = { NEW: ["IN_PROGRESS"], IN_PROGRESS: ["RESOLVED"] };
const CLOSE_FLOW: Flow = { NEW: ["CLOSED"] };

const FLOWS: Record<ReportType, Flow> = {
  DEFECT: WORK_FLOW,
  COMPLAINT: WORK_FLOW,
  REQUEST: { NEW: ["APPROVED", "REJECTED"] },
  NOTICE: CLOSE_FLOW,
  QUESTION: CLOSE_FLOW,
  IDEA: CLOSE_FLOW,
};

export function nextStatuses(type: ReportType, from: ReportStatus): ReportStatus[] {
  return FLOWS[type][from] ?? [];
}

export function canTransition(
  type: ReportType,
  from: ReportStatus,
  to: ReportStatus,
): boolean {
  return nextStatuses(type, from).includes(to);
}
