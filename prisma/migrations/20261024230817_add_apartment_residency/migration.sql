-- CreateTable
CREATE TABLE "ApartmentResidency" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApartmentResidency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApartmentResidency_userId_idx" ON "ApartmentResidency"("userId");

-- CreateIndex
CREATE INDEX "ApartmentResidency_apartmentId_idx" ON "ApartmentResidency"("apartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApartmentResidency_userId_apartmentId_key" ON "ApartmentResidency"("userId", "apartmentId");

-- AddForeignKey
ALTER TABLE "ApartmentResidency" ADD CONSTRAINT "ApartmentResidency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentResidency" ADD CONSTRAINT "ApartmentResidency_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentResidency" ADD CONSTRAINT "ApartmentResidency_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every membership that pointed at an apartment becomes a residency.
-- Membership."apartmentId" is deliberately left untouched (deprecated, kept for reversibility).
INSERT INTO "ApartmentResidency" ("id", "userId", "apartmentId", "communityId", "createdAt")
SELECT 'bf_' || m."id", m."userId", m."apartmentId", m."communityId", m."createdAt"
FROM "Membership" m
WHERE m."apartmentId" IS NOT NULL
ON CONFLICT ("userId", "apartmentId") DO NOTHING;
