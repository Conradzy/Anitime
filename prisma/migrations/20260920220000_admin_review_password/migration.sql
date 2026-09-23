ALTER TABLE "UserProfile" ADD COLUMN "sex" VARCHAR(10);
ALTER TABLE "IdentityDocumentCheck" ADD COLUMN "reviewTokenHash" TEXT, ADD COLUMN "reviewRequestedAt" TIMESTAMP(3), ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewDecision" VARCHAR(10);
CREATE UNIQUE INDEX "IdentityDocumentCheck_reviewTokenHash_key" ON "IdentityDocumentCheck"("reviewTokenHash");
CREATE TABLE "PasswordChangeRequest" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "newPasswordHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordChangeRequest_tokenHash_key" ON "PasswordChangeRequest"("tokenHash");
CREATE INDEX "PasswordChangeRequest_userId_idx" ON "PasswordChangeRequest"("userId");
ALTER TABLE "PasswordChangeRequest" ADD CONSTRAINT "PasswordChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
