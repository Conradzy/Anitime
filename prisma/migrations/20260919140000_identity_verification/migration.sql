-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PHONE_VERIFICATION', 'PHONE_CHANGE');

-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('PHILSYS');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'CAPTURED', 'IN_REVIEW', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "LivenessMethod" AS ENUM ('PASSIVE', 'ACTIVE');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('IDENTITY_VERIFICATION', 'BIOMETRIC_VERIFICATION', 'PRIVACY_NOTICE');

-- CreateEnum
CREATE TYPE "VerificationEventType" AS ENUM ('VERIFICATION_STARTED', 'DOCUMENT_SCANNED', 'DOCUMENT_VERIFIED', 'LIVENESS_STARTED', 'LIVENESS_COMPLETED', 'FACE_MATCH_STARTED', 'FACE_MATCH_COMPLETED', 'VERIFICATION_SUBMITTED', 'VERIFICATION_APPROVED', 'VERIFICATION_DECLINED', 'VERIFICATION_EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentMethodStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REMOVED');

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "birthdate" DATE,
    "profilePhotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentialAddress" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "barangay" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Philippines',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentialAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'PHONE_VERIFICATION',
    "status" "OtpStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityVerification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "providerSessionId" TEXT,
    "workflowId" TEXT,
    "idType" "IdType" NOT NULL DEFAULT 'PHILSYS',
    "countryCode" CHAR(2) NOT NULL DEFAULT 'PH',
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityDocumentCheck" (
    "id" SERIAL NOT NULL,
    "identityVerificationId" INTEGER NOT NULL,
    "documentType" "IdType" NOT NULL DEFAULT 'PHILSYS',
    "documentCountry" CHAR(2) NOT NULL DEFAULT 'PH',
    "documentValid" BOOLEAN,
    "documentExpired" BOOLEAN,
    "documentNumberLast4" VARCHAR(4),
    "nameMatch" BOOLEAN,
    "birthdateMatch" BOOLEAN,
    "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityDocumentCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivenessCheck" (
    "id" SERIAL NOT NULL,
    "identityVerificationId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "livenessPassed" BOOLEAN,
    "livenessMethod" "LivenessMethod",
    "confidenceScore" DECIMAL(5,4),
    "providerReference" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivenessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceMatchCheck" (
    "id" SERIAL NOT NULL,
    "identityVerificationId" INTEGER NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "faceMatchPassed" BOOLEAN,
    "matchScore" DECIMAL(5,4),
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaceMatchCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationConsent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "identityVerificationId" INTEGER,
    "consentType" "ConsentType" NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT true,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" INET,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvent" (
    "id" SERIAL NOT NULL,
    "identityVerificationId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ANITIME',
    "eventType" "VerificationEventType" NOT NULL,
    "providerEventId" TEXT,
    "status" "VerificationStatus",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPaymentMethod" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "providerPaymentMethodId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CARD',
    "brand" TEXT,
    "last4" VARCHAR(4),
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "cardholderName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "PaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentialAddress_userId_key" ON "ResidentialAddress"("userId");

-- CreateIndex
CREATE INDEX "PhoneOtp_userId_idx" ON "PhoneOtp"("userId");

-- CreateIndex
CREATE INDEX "PhoneOtp_expiresAt_idx" ON "PhoneOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "IdentityVerification_userId_idx" ON "IdentityVerification"("userId");

-- CreateIndex
CREATE INDEX "IdentityVerification_status_idx" ON "IdentityVerification"("status");

-- CreateIndex
CREATE INDEX "IdentityDocumentCheck_identityVerificationId_idx" ON "IdentityDocumentCheck"("identityVerificationId");

-- CreateIndex
CREATE INDEX "LivenessCheck_identityVerificationId_idx" ON "LivenessCheck"("identityVerificationId");

-- CreateIndex
CREATE INDEX "FaceMatchCheck_identityVerificationId_idx" ON "FaceMatchCheck"("identityVerificationId");

-- CreateIndex
CREATE INDEX "VerificationConsent_userId_idx" ON "VerificationConsent"("userId");

-- CreateIndex
CREATE INDEX "VerificationEvent_identityVerificationId_idx" ON "VerificationEvent"("identityVerificationId");

-- CreateIndex
CREATE INDEX "UserPaymentMethod_userId_idx" ON "UserPaymentMethod"("userId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentialAddress" ADD CONSTRAINT "ResidentialAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneOtp" ADD CONSTRAINT "PhoneOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityDocumentCheck" ADD CONSTRAINT "IdentityDocumentCheck_identityVerificationId_fkey" FOREIGN KEY ("identityVerificationId") REFERENCES "IdentityVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivenessCheck" ADD CONSTRAINT "LivenessCheck_identityVerificationId_fkey" FOREIGN KEY ("identityVerificationId") REFERENCES "IdentityVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceMatchCheck" ADD CONSTRAINT "FaceMatchCheck_identityVerificationId_fkey" FOREIGN KEY ("identityVerificationId") REFERENCES "IdentityVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationConsent" ADD CONSTRAINT "VerificationConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationConsent" ADD CONSTRAINT "VerificationConsent_identityVerificationId_fkey" FOREIGN KEY ("identityVerificationId") REFERENCES "IdentityVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_identityVerificationId_fkey" FOREIGN KEY ("identityVerificationId") REFERENCES "IdentityVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPaymentMethod" ADD CONSTRAINT "UserPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

