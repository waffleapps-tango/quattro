-- CreateEnum
CREATE TYPE "ResidencyKind" AS ENUM ('OWNER', 'TENANT');

-- Existing links become owners: add with a default, then drop it so new links must state their kind.
ALTER TABLE "ApartmentResidency"
  ADD COLUMN "kind" "ResidencyKind" NOT NULL DEFAULT 'OWNER',
  ADD COLUMN "livesHereOverride" BOOLEAN,
  ADD COLUMN "receivesPackages" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ApartmentResidency" ALTER COLUMN "kind" DROP DEFAULT;

-- At most one primary contact per apartment.
CREATE UNIQUE INDEX "ApartmentResidency_apartmentId_primary_key"
  ON "ApartmentResidency"("apartmentId") WHERE "isPrimary";
