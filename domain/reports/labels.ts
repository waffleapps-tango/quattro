import type { ReportStatus, ReportType } from "@/lib/generated/prisma";

export const TYPE_LABEL: Record<ReportType, string> = {
  DEFECT: "Usterka",
  REQUEST: "Wniosek",
  NOTICE: "Powiadomienie",
  QUESTION: "Pytanie",
  IDEA: "Pomysł",
  COMPLAINT: "Skarga",
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  NEW: "Nowe",
  IN_PROGRESS: "W trakcie",
  RESOLVED: "Załatwione",
  APPROVED: "Zatwierdzone",
  REJECTED: "Odrzucone",
  CLOSED: "Zamknięte",
};
