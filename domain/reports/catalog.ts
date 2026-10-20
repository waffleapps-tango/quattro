import type { ReportType } from "@/lib/generated/prisma";

export type Subject = "none" | "apartment" | "parking" | "storage";

export interface CategoryDef {
  key: string;
  visibility: "PUBLIC" | "PRIVATE";
  types: ReportType[];
  subject: Subject;
}

export const CATEGORIES: CategoryDef[] = [
  // ---- public: shared space ----
  {
    key: "technical",
    visibility: "PUBLIC",
    types: ["DEFECT"],
    subject: "none",
  },
  {
    key: "media",
    visibility: "PUBLIC",
    types: ["DEFECT"],
    subject: "none",
  },
  {
    key: "cleanliness",
    visibility: "PUBLIC",
    types: ["DEFECT"],
    subject: "none",
  },
  {
    key: "grounds",
    visibility: "PUBLIC",
    types: ["DEFECT", "IDEA"],
    subject: "none",
  },
  {
    key: "parking-shared",
    visibility: "PUBLIC",
    types: ["DEFECT"],
    subject: "none",
  },
  {
    key: "playground",
    visibility: "PUBLIC",
    types: ["DEFECT", "IDEA"],
    subject: "none",
  },
  {
    key: "security",
    visibility: "PUBLIC",
    types: ["DEFECT"],
    subject: "none",
  },
  {
    key: "pests",
    visibility: "PUBLIC",
    types: ["DEFECT"],
    subject: "none",
  },
  {
    key: "ideas",
    visibility: "PUBLIC",
    types: ["IDEA"],
    subject: "none",
  },
  {
    key: "other",
    visibility: "PUBLIC",
    types: ["DEFECT", "IDEA"],
    subject: "none",
  },

  // ---- private: my own things ----
  {
    key: "own-apartment",
    visibility: "PRIVATE",
    types: ["DEFECT", "QUESTION"],
    subject: "apartment",
  },
  {
    key: "own-parking",
    visibility: "PRIVATE",
    types: ["DEFECT", "REQUEST", "QUESTION"],
    subject: "parking",
  },
  {
    key: "own-storage",
    visibility: "PRIVATE",
    types: ["DEFECT", "QUESTION"],
    subject: "storage",
  },
  {
    key: "access",
    visibility: "PRIVATE",
    types: ["DEFECT", "REQUEST", "NOTICE"],
    subject: "none",
  },
  {
    key: "billing",
    visibility: "PRIVATE",
    types: ["QUESTION", "REQUEST", "NOTICE"],
    subject: "none",
  },
  {
    key: "balcony",
    visibility: "PRIVATE",
    types: ["DEFECT", "REQUEST", "QUESTION"],
    subject: "none",
  },
  {
    key: "renovation",
    visibility: "PRIVATE",
    types: ["NOTICE", "REQUEST", "DEFECT", "QUESTION"],
    subject: "none",
  },
  {
    key: "moving",
    visibility: "PRIVATE",
    types: ["NOTICE", "REQUEST", "QUESTION"],
    subject: "none",
  },
  {
    key: "neighbours",
    visibility: "PRIVATE",
    types: ["COMPLAINT"],
    subject: "none",
  },
  {
    key: "admin",
    visibility: "PRIVATE",
    types: ["QUESTION", "REQUEST"],
    subject: "none",
  },
];

export function getCategory(key: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.key === key);
}
