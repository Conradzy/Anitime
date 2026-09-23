import { prisma } from '@/lib/prisma';
import { logVerificationEvent } from '@/lib/verification';
import { hashToken } from '@/lib/id-review';
import { notify } from '@/lib/notify';

/** Loads a review by its emailed token, with what the reviewer needs to see. */
export async function findReview(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return prisma.identityDocumentCheck.findUnique({
    where: { reviewTokenHash: hashToken(token) },
    include: {
      identityVerification: {
        include: {
          user: { select: { id: true, fullname: true, email: true, phoneNumber: true, profile: { select: { birthdate: true } } } },
          livenessChecks: { orderBy: { id: 'desc' }, take: 1 },
          faceMatches: { orderBy: { id: 'desc' }, take: 1 },
        },
      },
    },
  });
}

/** Applies the admin's decision once. Confirming a check that is the last thing
 * holding the verification back also grants the Verified badge. */
export async function applyDecision(token: string, decision: 'APPROVED' | 'DECLINED') {
  const check = await findReview(token);
  if (!check) return { ok: false as const, error: 'This review link is not valid.' };
  if (check.reviewDecision) return { ok: false as const, error: 'This ID was already reviewed.', decision: check.reviewDecision };

  const v = check.identityVerification;
  const userId = v.user.id;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.identityDocumentCheck.update({
      where: { id: check.id },
      data: { reviewDecision: decision, reviewedAt: now, documentStatus: decision },
    });
    if (v.status === 'IN_REVIEW') {
      if (decision === 'APPROVED') {
        await tx.identityVerification.update({
          where: { id: v.id },
          data: { status: 'APPROVED', completedAt: now, decisionReason: 'Approved by the AniTime admin after reviewing the ID photos and selfie.' },
        });
        await tx.user.update({ where: { id: userId }, data: { sellerVerified: true } });
      } else {
        await tx.identityVerification.update({
          where: { id: v.id },
          data: { status: 'DECLINED', completedAt: now, decisionReason: 'National ID rejected by the AniTime admin.' },
        });
        await tx.user.update({ where: { id: userId }, data: { sellerVerified: false } });
      }
    }
  });
  await logVerificationEvent(v.id, decision === 'APPROVED' ? 'VERIFICATION_APPROVED' : 'VERIFICATION_DECLINED', { by: 'admin', checkId: check.id });
  await notify({
    userId,
    type: 'VERIFICATION',
    title: decision === 'APPROVED' ? 'Your National ID was confirmed' : 'Your National ID was rejected',
    body:
      decision === 'APPROVED'
        ? 'You are now a verified seller — your Verified badge is live and you can post produce.'
        : 'The AniTime admin could not confirm your ID. You can submit clearer photos and try again.',
    link: decision === 'APPROVED' ? '/profile' : '/account/verification',
  });
  return { ok: true as const, decision };
}
