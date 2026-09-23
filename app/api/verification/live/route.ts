import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';
import { PHOTO_PATH_RE } from '@/lib/storage';
import { getOrStartVerification, logVerificationEvent } from '@/lib/verification';

const PROVIDER = 'facex-browser';
const clamp01 = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 10000) / 10000)) : null;

/**
 * POST { selfiePath, livenessPassed, livenessScore, matchScore, faceMatched } —
 * records the result of the in-browser live check (FaceX face detection +
 * embeddings and a head-turn challenge).
 *
 * Trust model: the checks run in the user's browser, so the server cannot prove
 * they ran honestly. That is why the selfie is stored: a person can audit any
 * account later. A failed liveness check is never saved as a pass; a face that
 * doesn't match the ID photo is saved and sends the whole verification to
 * manual review instead of blocking it.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const selfiePath = typeof body?.selfiePath === 'string' ? body.selfiePath : '';
  if (!PHOTO_PATH_RE.test(selfiePath) || !selfiePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'The selfie was not received. Please try the check again.' }, { status: 400 });
  }
  if (body.livenessPassed !== true) {
    return NextResponse.json({ error: 'The live check was not completed.' }, { status: 422 });
  }

  const verification = await getOrStartVerification(user.id);
  const faceMatched = typeof body.faceMatched === 'boolean' ? body.faceMatched : null;

  await prisma.$transaction([
    prisma.livenessCheck.create({
      data: {
        identityVerificationId: verification.id,
        provider: PROVIDER,
        status: 'APPROVED',
        livenessPassed: true,
        livenessMethod: 'ACTIVE',
        confidenceScore: clamp01(body.livenessScore),
        selfiePath,
        completedAt: new Date(),
      },
    }),
    prisma.faceMatchCheck.create({
      data: {
        identityVerificationId: verification.id,
        status: faceMatched ? 'APPROVED' : 'IN_REVIEW',
        faceMatchPassed: faceMatched,
        matchScore: clamp01(body.matchScore),
        selfiePath,
        providerReference: PROVIDER,
      },
    }),
  ]);
  await logVerificationEvent(verification.id, 'LIVENESS_COMPLETED', { method: 'ACTIVE' });
  await logVerificationEvent(verification.id, 'FACE_MATCH_COMPLETED', { matched: faceMatched });

  return NextResponse.json({ ok: true, faceMatched });
}
