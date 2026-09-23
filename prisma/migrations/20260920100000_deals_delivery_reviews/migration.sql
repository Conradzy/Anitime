-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('DELIVERY', 'PICKUP');

-- Offer: delivery/pickup, date and time, and where the buyer is
ALTER TABLE "Offer"
  ADD COLUMN "fulfillment" "Fulfillment" NOT NULL DEFAULT 'PICKUP',
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "buyerLat" DOUBLE PRECISION,
  ADD COLUMN "buyerLng" DOUBLE PRECISION,
  ADD COLUMN "buyerAddress" TEXT;

-- Transaction: schedule, route and confirmations
ALTER TABLE "Transaction"
  ADD COLUMN "fulfillment" "Fulfillment" NOT NULL DEFAULT 'PICKUP',
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "originLat" DOUBLE PRECISION,
  ADD COLUMN "originLng" DOUBLE PRECISION,
  ADD COLUMN "originLabel" TEXT,
  ADD COLUMN "destLat" DOUBLE PRECISION,
  ADD COLUMN "destLng" DOUBLE PRECISION,
  ADD COLUMN "destLabel" TEXT,
  ADD COLUMN "distanceKm" DECIMAL(8,2),
  ADD COLUMN "routePath" JSONB,
  ADD COLUMN "routeSource" TEXT,
  ADD COLUMN "sellerDeliveredAt" TIMESTAMP(3),
  ADD COLUMN "buyerConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "paidAt" TIMESTAMP(3);

-- Review: rate either side of a deal, once each (a rename keeps existing rows)
ALTER TABLE "Review" RENAME COLUMN "sellerId" TO "revieweeId";
ALTER TABLE "Review" RENAME CONSTRAINT "Review_sellerId_fkey" TO "Review_revieweeId_fkey";
ALTER INDEX "Review_sellerId_idx" RENAME TO "Review_revieweeId_idx";
DROP INDEX "Review_transactionId_key";
CREATE UNIQUE INDEX "Review_transactionId_reviewerId_key" ON "Review"("transactionId", "reviewerId");

-- Pictures sent in chat
CREATE TABLE "MessageAttachment" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
