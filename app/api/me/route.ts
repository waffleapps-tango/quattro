import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ role: null });

  const role = user.memberships[0]?.role ?? null;
  return NextResponse.json({ role });
}
