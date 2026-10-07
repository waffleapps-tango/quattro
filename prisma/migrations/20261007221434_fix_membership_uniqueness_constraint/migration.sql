/*
  Warnings:

  - A unique constraint covering the columns `[userId,communityId]` on the table `Membership` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Membership_userId_communityId_apartmentId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_communityId_key" ON "Membership"("userId", "communityId");
