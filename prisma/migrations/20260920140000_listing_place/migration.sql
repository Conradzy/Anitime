-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('FARM', 'SHOP', 'STORAGE');

-- Listing: where buyers find the produce
ALTER TABLE "Listing"
  ADD COLUMN "placeType" "PlaceType" NOT NULL DEFAULT 'FARM',
  ADD COLUMN "placeName" TEXT,
  ADD COLUMN "addressDetails" TEXT;
