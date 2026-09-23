import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';
import { requestAdminReview } from '@/lib/id-review';
import { getOrStartVerification, getVerificationState, logVerificationEvent } from '@/lib/verification';

/**
 * POST — final submit. Re-checks every step on the server (the browser's word
 * is never enough) and then decides:
 *
 *   all checks consistent -> APPROVED, and the Verified badge is granted
 *   anything unresolved   -> IN_REVIEW, waiting for a person
 *
 * Note on what APPROVED means today: the PhilID QR payload was read and it
 * matched the account's name and birthdate. The PSA signature was NOT
 * verified, because that needs PhilSys accreditation. decisionReason records this so the basis of
 * every decision stays auditable once a real provider is added.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const state = await getVerificationState(user.id);
  if (state.identityVerified) {
    return NextResponse.json({ status: 'APPROVED', alreadyVerified: true });
  }

  const missing = (Object.keys(state.done) as (keyof typeof state.done)[]).filter((k) => !state.done[k]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Finish every step before completing verification.', missing },
      { status: 400 }
    );
  }

  const verification = await getOrStartVerification(user.id);
  const doc = await prisma.identityDocumentCheck.findFirst({
    where: { identityVerificationId: verification.id },
    orderBy: { id: 'desc' },
  });

  const face = await prisma.faceMatchCheck.findFirst({
    where: { identityVerificationId: verification.id },
    orderBy: { id: 'desc' },
  });
  // A face that doesn't match the ID photo (or couldn't be compared) is not a
  // rejection — it just means a person looks at it instead of the machine.
  const approved =
    doc?.reviewDecision === 'APPROVED' || (doc?.documentStatus === 'APPROVED' && face?.faceMatchPassed === true);
  const now = new Date();
  const decisionReason = approved
    ? 'PhilID QR payload read and consistent with the account; live head-turn check passed and the selfie matched the ID photo (FaceX, in-browser). PSA signature not verified (no PhilSys accreditation). ID photos and selfie are stored for audit.'
    : 'The ID details or the selfie-to-ID face match could not be confirmed automatically — awaiting manual review.';

  await prisma.$transaction(async (tx) => {
    await tx.identityVerification.update({
      where: { id: verification.id },
      data: {
        status: approved ? 'APPROVED' : 'IN_REVIEW',
        decisionReason,
        completedAt: approved ? now : null,
      },
    });
    if (approved) {
      await tx.user.update({ where: { id: user.id }, data: { sellerVerified: true } });
    }
  });

  // Anything the machine could not settle goes to the admin, with the photos.
  if (!approved && doc && doc.frontImagePath && doc.backImagePath && !doc.reviewDecision) {
    await requestAdminReview(doc.id, new URL(req.url).origin, 'The ID details or the selfie-to-ID face match could not be confirmed automatically.');
  }

  await logVerificationEvent(verification.id, 'VERIFICATION_SUBMITTED');
  await logVerificationEvent(verification.id, approved ? 'VERIFICATION_APPROVED' : 'VERIFICATION_DECLINED', {
    autoApproved: approved,
  });

  return NextResponse.json({ status: approved ? 'APPROVED' : 'IN_REVIEW' });
}
