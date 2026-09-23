import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendIdReviewEmail } from '@/lib/mail';
import { logVerificationEvent } from '@/lib/verification';

/** The one person who decides manual ID reviews. Fixed in code on purpose:
 * it is not read from the environment, a form or the database, so it can't be
 * changed from the app. */
export const ID_REVIEW_ADMIN_EMAIL = 'ripgusionmain@gmail.com';

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Emails the admin a private link to review this ID check. The link's token
 * is random; only its hash is stored. Sending again replaces the old link. */
export async function requestAdminReview(checkId: number, origin: string, reason: string) {
  const check = await prisma.identityDocumentCheck.findUnique({
    where: { id: checkId },
    include: { identityVerification: { include: { user: { select: { fullname: true } } } } },
  });
  if (!check || check.reviewDecision) return { sent: false as const };

  const token = randomBytes(32).toString('hex');
  await prisma.identityDocumentCheck.update({
    where: { id: checkId },
    data: { reviewTokenHash: hashToken(token), reviewRequestedAt: new Date() },
  });

  const base = (process.env.APP_URL || origin).replace(/\/$/, '');
  try {
    await sendIdReviewEmail(ID_REVIEW_ADMIN_EMAIL, {
      applicant: check.identityVerification.user.fullname,
      link: `${base}/review/${token}`,
      reason,
    });
  } catch (e) {
    console.error('Could not email the ID reviewer', e);
    return { sent: false as const };
  }
  await logVerificationEvent(check.identityVerificationId, 'DOCUMENT_SCANNED', { adminNotified: true, checkId });
  return { sent: true as const };
}
