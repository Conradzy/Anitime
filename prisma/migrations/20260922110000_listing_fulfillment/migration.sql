CREATE TYPE "ListingFulfillment" AS ENUM ('PICKUP', 'DELIVERY', 'BOTH');
ALTER TABLE "Listing" ADD COLUMN "fulfillment" "ListingFulfillment" NOT NULL DEFAULT 'BOTH';
