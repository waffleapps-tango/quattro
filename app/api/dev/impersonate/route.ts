import { NextResponse, type NextRequest } from "next/server";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_ENABLED,
  IMPERSONATION_KEY,
} from "@/auth/dev-impersonation";

// TEMPORARY E2E, see auth/dev-impersonation.ts.
export async function GET(req: NextRequest) {
  if (!IMPERSONATION_ENABLED) return new NextResponse("Not found", { status: 404 });
  const as = req.nextUrl.searchParams.get("as") ?? "";
  const res = NextResponse.redirect(new URL("/", req.url));
  if (IMPERSONATION_KEY.test(as)) {
    res.cookies.set(IMPERSONATION_COOKIE, as, { path: "/", httpOnly: true, sameSite: "lax" });
  } else {
    res.cookies.delete(IMPERSONATION_COOKIE);
  }
  return res;
}
