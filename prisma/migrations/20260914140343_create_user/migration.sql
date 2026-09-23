/*
  Warnings:

  - You are about to drop the column `Product` on the `User` table. All the data in the column will be lost.
  - Added the required column `product` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "Product",
ADD COLUMN     "product" TEXT NOT NULL,
ALTER COLUMN "businessname" DROP NOT NULL;
