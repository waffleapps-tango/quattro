import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { IMPERSONATION_COOKIE, IMPERSONATION_ENABLED } from '@/auth/dev-impersonation';

const isProtectedRoute = createRouteMatcher([
  '/packages(.*)',
  '/reports(.*)',
  '/locations(.*)',
  '/users(.*)',
  '/admin(.*)',
  '/posts(.*)',
  '/profile(.*)',
  '/info(.*)',
  '/settings(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const impersonating = IMPERSONATION_ENABLED && req.cookies.has(IMPERSONATION_COOKIE);
  if (isProtectedRoute(req) && !impersonating) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}; 