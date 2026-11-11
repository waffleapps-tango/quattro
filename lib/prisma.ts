import { PrismaClient } from "./generated/prisma"
import { withConnectionLimit } from "./db-url"

const globalForPrisma = global as unknown as {
  prisma: PrismaClient
}

// Serverless functions run one request at a time, so one connection each (Prisma's
// own recommendation); a local process gets a small pool. See lib/db-url.ts.
const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: withConnectionLimit(process.env.DATABASE_URL, process.env.VERCEL ? 1 : 5),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
