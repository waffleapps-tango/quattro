-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('ANNOUNCEMENT', 'NEIGHBOR');

-- AlterTable: add nullable first so existing rows can be backfilled
ALTER TABLE "Post"
  ADD COLUMN "communityId" TEXT,
  ADD COLUMN "authorId" TEXT,
  ADD COLUMN "kind" "PostKind" NOT NULL DEFAULT 'ANNOUNCEMENT',
  ADD COLUMN "pinnedUntil" TIMESTAMP(3);

-- Backfill: posts used to be global; they belong to the (single) oldest community.
-- If posts exist but no community does, SET NOT NULL below fails loudly on purpose.
UPDATE "Post"
SET "communityId" = (SELECT "id" FROM "Community" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "communityId" IS NULL;

ALTER TABLE "Post" ALTER COLUMN "communityId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Post_communityId_kind_createdAt_idx" ON "Post"("communityId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
