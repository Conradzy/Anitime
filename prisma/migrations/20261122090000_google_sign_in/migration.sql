ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

CREATE TABLE "GoogleSignInChallenge" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GoogleSignInChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GoogleSignInChallenge_expiresAt_idx" ON "GoogleSignInChallenge"("expiresAt");
