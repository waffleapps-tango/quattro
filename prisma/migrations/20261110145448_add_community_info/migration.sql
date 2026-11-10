-- CreateEnum
CREATE TYPE "InfoSectionKind" AS ENUM ('CONTACTS', 'TEXT');

-- CreateTable
CREATE TABLE "InfoSection" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "InfoSectionKind" NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfoSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfoContact" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "note" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "InfoContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InfoSection_communityId_position_idx" ON "InfoSection"("communityId", "position");

-- CreateIndex
CREATE INDEX "InfoContact_sectionId_position_idx" ON "InfoContact"("sectionId", "position");

-- AddForeignKey
ALTER TABLE "InfoSection" ADD CONSTRAINT "InfoSection_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfoContact" ADD CONSTRAINT "InfoContact_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "InfoSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
