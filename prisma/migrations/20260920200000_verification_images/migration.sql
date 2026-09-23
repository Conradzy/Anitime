ALTER TABLE "IdentityDocumentCheck" ADD COLUMN "frontImagePath" TEXT, ADD COLUMN "backImagePath" TEXT, ADD COLUMN "nameScore" DECIMAL(5,4);
ALTER TABLE "LivenessCheck" ADD COLUMN "selfiePath" TEXT;
ALTER TABLE "FaceMatchCheck" ADD COLUMN "selfiePath" TEXT;
