import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth/session";
import { impersonatedEmail } from "@/auth/dev-impersonation";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ role: null });

  const role = user.memberships[0]?.role ?? null;
  // TEMPORARY E2E: without a Clerk session the client needs the profile from here.
  if (await impersonatedEmail()) {
    return NextResponse.json({
      role,
      impersonated: true,
      user: { firstName: user.firstName, lastName: user.lastName, email: user.email },
    });
  }
  return NextResponse.json({ role });
}
