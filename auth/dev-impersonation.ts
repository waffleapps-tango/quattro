// TEMPORARY E2E: lets a local dev server act as a seeded `<key>+clerk_test@quattro.dev` user
// without signing in to Clerk. Off unless NODE_ENV=development AND NEXT_PUBLIC_E2E_IMPERSONATE=1,
// so it is dead code on Vercel. Switch user: /api/dev/impersonate?as=resident1 (no `as` = stop).
// Remove this file and its call sites once real E2E auth (Clerk testing tokens) is set up.
export const IMPERSONATION_ENABLED =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_E2E_IMPERSONATE === "1";
export const IMPERSONATION_COOKIE = "e2e-as";
export const IMPERSONATION_KEY = /^[a-z0-9]{1,32}$/;

export async function impersonatedEmail(): Promise<string | null> {
  if (!IMPERSONATION_ENABLED) return null;
  const { cookies } = await import("next/headers");
  const key = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  return key && IMPERSONATION_KEY.test(key) ? `${key}+clerk_test@quattro.dev` : null;
}
