// Public base URL for links in emails. APP_URL wins (custom domain, local dev); on Vercel it falls back
// to the project's stable production domain, which unlike VERCEL_URL does not change per deployment.
export function getAppUrl(): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (process.env.APP_URL || (prod ? `https://${prod}` : "")).replace(/\/+$/, "");
}
