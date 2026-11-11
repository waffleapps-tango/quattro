import prisma from "@/lib/prisma";
(async () => {
  const [max] = await prisma.$queryRaw<{ max_connections: string }[]>`SHOW max_connections`;
  const rows = await prisma.$queryRaw<{ app: string; addr: string | null; n: number }[]>`SELECT coalesce(application_name,'') AS app, client_addr::text AS addr, count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1,2 ORDER BY n DESC`;
  console.log("max_connections", max.max_connections);
  console.log(rows.map((r) => `${r.n} ${r.app || "-"} ${r.addr ?? "local"}`).join("\n"));
  await prisma.$disconnect();
})();
