import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth/session";
import { impersonatedEmail } from "@/auth/dev-impersonation";
import prisma from "@/lib/prisma";
import { canInviteResidents } from "@/domain/memberships/invites";
import { canDecideJoinRequests } from "@/domain/join-requests";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ role: null });

  const membership = user.memberships[0];
  const role = membership?.role ?? null;
  // Sidebar "Admin" link: managers always, reception only when the community lets it do something there.
  const community = membership && (await prisma.community.findUnique({ where: { id: membership.communityId } }));
  const adminAccess = !!membership && !!community && (canInviteResidents(membership, community) || canDecideJoinRequests(membership, community));
  // TEMPORARY E2E: without a Clerk session the client needs the profile from here.
  if (await impersonatedEmail()) {
    return NextResponse.json({
      role,
      adminAccess,
      impersonated: true,
      user: { firstName: user.firstName, lastName: user.lastName, email: user.email },
    });
  }
  return NextResponse.json({ role, adminAccess });
}
