-- CreateEnum
CREATE TYPE "BuyRequestStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CLOSED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "buyRequestId" INTEGER,
ALTER COLUMN "listingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "buyRequestId" INTEGER,
ADD COLUMN     "sellerAddress" TEXT,
ADD COLUMN     "sellerLat" DOUBLE PRECISION,
ADD COLUMN     "sellerLng" DOUBLE PRECISION,
ALTER COLUMN "listingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "buyRequestId" INTEGER,
ALTER COLUMN "listingId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BuyRequest" (
    "id" SERIAL NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "crop" TEXT NOT NULL,
    "variety" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "quantity" DECIMAL(12,3) NOT NULL,
    "remainingQuantity" DECIMAL(12,3) NOT NULL,
    "targetPrice" DECIMAL(12,2),
    "priceType" "PriceType" NOT NULL DEFAULT 'NEGOTIABLE',
    "paymentMethods" "PaymentMethod"[],
    "description" TEXT,
    "location" TEXT NOT NULL,
    "fulfillment" "ListingFulfillment" NOT NULL DEFAULT 'BOTH',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "neededBy" TIMESTAMP(3),
    "status" "BuyRequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyRequestPhoto" (
    "id" SERIAL NOT NULL,
    "buyRequestId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyRequestPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyRequest_buyerId_status_idx" ON "BuyRequest"("buyerId", "status");

-- CreateIndex
CREATE INDEX "BuyRequest_status_createdAt_idx" ON "BuyRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BuyRequestPhoto_buyRequestId_idx" ON "BuyRequestPhoto"("buyRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_buyRequestId_sellerId_key" ON "Conversation"("buyRequestId", "sellerId");

-- CreateIndex
CREATE INDEX "Offer_buyRequestId_idx" ON "Offer"("buyRequestId");

-- AddForeignKey
ALTER TABLE "BuyRequest" ADD CONSTRAINT "BuyRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyRequestPhoto" ADD CONSTRAINT "BuyRequestPhoto_buyRequestId_fkey" FOREIGN KEY ("buyRequestId") REFERENCES "BuyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_buyRequestId_fkey" FOREIGN KEY ("buyRequestId") REFERENCES "BuyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyRequestId_fkey" FOREIGN KEY ("buyRequestId") REFERENCES "BuyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_buyRequestId_fkey" FOREIGN KEY ("buyRequestId") REFERENCES "BuyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

