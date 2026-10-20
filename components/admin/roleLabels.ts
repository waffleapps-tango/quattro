import { Role } from "@/lib/generated/prisma";

export const ROLE_LABEL: Record<Role, string> = {
  RESIDENT: "Mieszkaniec",
  RECEPTIONIST: "Recepcja",
  MANAGER: "Zarządca",
  ADMIN: "Administrator",
};
