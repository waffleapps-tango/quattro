import type { SessionUser } from "@/auth/session";
import { Role } from "@/lib/generated/prisma";

// Posts are global (no communityId), so any manager/admin may write; everyone else only reads.
export function canWritePosts(user: SessionUser | null): boolean {
  return !!user?.memberships.some((m) => m.role === Role.MANAGER || m.role === Role.ADMIN);
}
