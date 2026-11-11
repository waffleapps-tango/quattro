// Prisma's default pool is 2 x CPU + 1 connections per process. The Cloud SQL
// db-f1-micro instance allows 25 in total, so a few Vercel functions plus a local
// dev server exhausted it (P2037 "Too many database connections").
// ponytail: per-process cap; put PgBouncer / Prisma Accelerate in front or upgrade
// the instance tier once traffic outgrows it.
export function withConnectionLimit(url: string | undefined, limit: number): string | undefined {
  if (!url) return url;
  const parsed = new URL(url);
  if (parsed.searchParams.has("connection_limit")) return url;
  parsed.searchParams.set("connection_limit", String(limit));
  return parsed.toString();
}
