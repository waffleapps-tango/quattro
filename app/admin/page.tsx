import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";
import { canInviteResidents } from "@/domain/memberships/invites";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";

export default async function AdminPage() {
  const membership = (await getCurrentUser())?.memberships[0];
  if (membership?.role === Role.RECEPTIONIST) {
    // No users tab for reception: land on the first tab they may open.
    const community = await prisma.community.findUnique({ where: { id: membership.communityId } });
    redirect(community && canInviteResidents(membership, community) ? "/admin/apartments" : "/admin/requests");
  }
  redirect("/admin/users");
}
