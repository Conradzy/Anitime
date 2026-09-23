import { prisma } from '@/lib/prisma';
import { maskPhone } from '@/lib/phone';
import { photoUrl } from '@/lib/storage';
import type { VerificationEventType, Prisma } from '@/lib/generated/prisma/client';

/** Bumped when the wording of the consent notice changes, so old consents
 * stay distinguishable from new ones. */
export const CONSENT_VERSION = '2026-09-1';

/** The steps the wizard asks for, in order. Liveness + face match are a
 * planned sixth step; their tables already exist so adding them here and in
 * the UI is all that is needed. */
export const STEP_KEYS = ['account', 'personal', 'address', 'document', 'live', 'review'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export type VerificationState = {
  account: { fullname: string; email: string; phone: string | null; phoneMasked: string | null; phoneVerified: boolean };
  personal: { birthdate: string | null; sex: string | null; profilePhotoUrl: string | null };
  address: {
    addressLine1: string; addressLine2: string | null; barangay: string;
    municipality: string; province: string; region: string; postalCode: string | null; country: string;
  } | null;
  document: {
    status: string; documentNumberLast4: string | null;
    nameMatch: boolean | null; birthdateMatch: boolean | null;
    frontImageUrl: string | null; backImageUrl: string | null;
  } | null;
  live: { passed: boolean; faceMatched: boolean | null; selfieUrl: string | null } | null;
  identity: { status: string; decisionReason: string | null } | null;
  /** Which steps are satisfied — drives the step indicator and the guard on
   * "Complete verification". */
  done: Record<Exclude<StepKey, 'review'>, boolean>;
  identityVerified: boolean;
};

/** Everything the wizard needs, with nothing sensitive in it: the phone is
 * masked and only the last 4 digits of the ID number are ever included. */
export async function getVerificationState(userId: number): Promise<VerificationState> {
  const [user, profile, address, verification] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { fullname: true, email: true, phoneNumber: true, phoneVerified: true, sellerVerified: true },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.residentialAddress.findUnique({ where: { userId } }),
    prisma.identityVerification.findFirst({
      where: { userId },
      orderBy: { id: 'desc' },
      include: {
        documentChecks: { orderBy: { id: 'desc' }, take: 1 },
        livenessChecks: { orderBy: { id: 'desc' }, take: 1 },
        faceMatches: { orderBy: { id: 'desc' }, take: 1 },
      },
    }),
  ]);

  const doc = verification?.documentChecks[0] ?? null;
  const liveCheck = verification?.livenessChecks[0] ?? null;
  const faceCheck = verification?.faceMatches[0] ?? null;
  const liveDone = Boolean(liveCheck?.livenessPassed);
  const documentDone = doc ? doc.documentStatus !== 'PENDING' && doc.documentStatus !== 'DECLINED' : false;

  return {
    account: {
      fullname: user.fullname,
      email: user.email,
      phone: user.phoneNumber,
      phoneMasked: user.phoneNumber ? maskPhone(user.phoneNumber) : null,
      phoneVerified: Boolean(user.phoneVerified),
    },
    personal: {
      birthdate: profile?.birthdate ? profile.birthdate.toISOString().slice(0, 10) : null,
      sex: profile?.sex ?? null,
      profilePhotoUrl: profile?.profilePhotoUrl ?? null,
    },
    address: address
      ? {
          addressLine1: address.addressLine1, addressLine2: address.addressLine2,
          barangay: address.barangay, municipality: address.municipality,
          province: address.province, region: address.region,
          postalCode: address.postalCode, country: address.country,
        }
      : null,
    document: doc
      ? {
          status: doc.documentStatus,
          documentNumberLast4: doc.documentNumberLast4,
          nameMatch: doc.nameMatch,
          birthdateMatch: doc.birthdateMatch,
          frontImageUrl: doc.frontImagePath ? photoUrl(doc.frontImagePath) : null,
          backImageUrl: doc.backImagePath ? photoUrl(doc.backImagePath) : null,
        }
      : null,
    live: liveCheck
      ? {
          passed: Boolean(liveCheck.livenessPassed),
          faceMatched: faceCheck?.faceMatchPassed ?? null,
          selfieUrl: liveCheck.selfiePath ? photoUrl(liveCheck.selfiePath) : null,
        }
      : null,
    identity: verification ? { status: verification.status, decisionReason: verification.decisionReason } : null,
    done: {
      account: Boolean(user.phoneVerified),
      personal: Boolean(profile?.birthdate && profile?.sex),
      address: Boolean(address),
      document: documentDone,
      live: liveDone,
    },
    identityVerified: user.sellerVerified,
  };
}

/** The verification attempt in progress, created on first use. A finished
 * attempt (approved/declined) is never reopened — retrying starts a new one. */
export async function getOrStartVerification(userId: number) {
  const open = await prisma.identityVerification.findFirst({
    where: { userId, status: { in: ['PENDING', 'IN_PROGRESS', 'IN_REVIEW'] } },
    orderBy: { id: 'desc' },
  });
  if (open) return open;

  const created = await prisma.identityVerification.create({
    data: { userId, status: 'IN_PROGRESS', startedAt: new Date() },
  });
  await logVerificationEvent(created.id, 'VERIFICATION_STARTED');
  return created;
}

/** Audit trail. Never pass ID numbers, OTP codes or biometric data here. */
export async function logVerificationEvent(
  identityVerificationId: number,
  eventType: VerificationEventType,
  metadata?: Prisma.InputJsonValue
) {
  await prisma.verificationEvent.create({
    data: { identityVerificationId, eventType, ...(metadata === undefined ? {} : { metadata }) },
  });
}

/** Region shown on the review screen — the street and barangay stay hidden
 * even from the user's own summary, matching what a support agent would see. */
export function maskAddress(a: NonNullable<VerificationState['address']>): string {
  return `Barangay ${'•'.repeat(Math.min(a.barangay.length, 6))}, ${a.municipality}, ${a.province}`;
}
