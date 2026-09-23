import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';
import {
  ageFrom, cardDisplayName, cardLast4, compareBirthdates, compareLocation, compareNames, parsePhilIdQr, prettyDate,
} from '@/lib/philid';
import { PHOTO_PATH_RE, photoUrl } from '@/lib/storage';
import { requestAdminReview } from '@/lib/id-review';
import { CONSENT_VERSION, getOrStartVerification, logVerificationEvent } from '@/lib/verification';

/** `@db.Inet` rejects anything that isn't an address, so anything odd in the
 * proxy header is dropped rather than stored. */
function clientIp(req: Request): string | null {
  const raw = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (!raw) return null;
  const v4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  const v6 = /^[0-9a-fA-F:]+$/;
  return v4.test(raw) || (raw.includes(':') && v6.test(raw)) ? raw : null;
}

/** A photo path is only accepted if it is well-formed AND lives in the caller's own folder. */
function ownPath(v: unknown, userId: number): string | null {
  return typeof v === 'string' && PHOTO_PATH_RE.test(v) && v.startsWith(`${userId}/`) ? v : null;
}

/**
 * POST { qr, consent, frontPath?, backPath? } — reads a scanned PhilID QR payload.
 * POST { manualReview: true, consent } — skips the scan and asks for a human.
 *
 * The QR is never stored and never echoed back: only the derived checks and
 * the last 4 digits of the card number are kept.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.consent) {
    return NextResponse.json({ error: 'Please agree to the identity verification notice first.' }, { status: 400 });
  }

  const verification = await getOrStartVerification(user.id);

  // Record consent once per attempt, before anything is processed.
  const already = await prisma.verificationConsent.count({
    where: { userId: user.id, identityVerificationId: verification.id },
  });
  if (already === 0) {
    const ipAddress = clientIp(req);
    await prisma.verificationConsent.createMany({
      data: (['IDENTITY_VERIFICATION', 'PRIVACY_NOTICE'] as const).map((consentType) => ({
        userId: user.id,
        identityVerificationId: verification.id,
        consentType,
        consentVersion: CONSENT_VERSION,
        consentGiven: true,
        ipAddress,
      })),
    });
  }

  if (body.manualReview) {
    // A person can only judge the ID from its photos, so both sides are required.
    if (!ownPath(body.frontPath, user.id) || !ownPath(body.backPath, user.id)) {
      return NextResponse.json({ error: 'Take a photo of the front and the back of your ID first.' }, { status: 400 });
    }
    const check = await prisma.identityDocumentCheck.create({
      data: { identityVerificationId: verification.id, documentStatus: 'IN_REVIEW' },
    });
    await logVerificationEvent(verification.id, 'DOCUMENT_SCANNED', { manualReview: true, checkId: check.id });
    const mail = await requestAdminReview(check.id, new URL(req.url).origin, 'The applicant could not scan the QR code and asked for a manual review.');
    return NextResponse.json({ ok: true, needsReview: true, adminNotified: mail.sent, nameMatch: null, birthdateMatch: null, last4: null, comparison: null });
  }

  const payload = parsePhilIdQr(String(body.qr ?? ''));
  if (!payload) {
    return NextResponse.json(
      { error: "That QR code isn't a Philippine National ID. Scan the QR on the back of your PhilID or ePhilID." },
      { status: 422 }
    );
  }

  const [profile, address] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id } }),
    prisma.residentialAddress.findUnique({ where: { userId: user.id } }),
  ]);
  const name = compareNames(user.fullname, payload);
  const birth = compareBirthdates(profile?.birthdate, payload);
  const place = compareLocation(payload, address);
  const last4 = cardLast4(payload.cardNumber);

  // A forgiving check: a typo, a missing middle name or a written-differently
  // date must not send an honest person to review. Only a clearly different
  // name, or a genuinely different birthdate, does. The place is shown but
  // never decides anything (a PhilID shows where you were born, which is often
  // not where you live now).
  //
  // This is still a consistency check, not proof: the PSA signature can only be
  // verified by an accredited relying party.
  const nameOk = name.status === 'match' || name.status === 'close';
  const consistent = nameOk && birth !== 'mismatch';
  const documentStatus = consistent ? 'APPROVED' : 'IN_REVIEW';
  const nameMatch = nameOk;
  const birthdateMatch = birth === 'missing' ? null : birth === 'match' || birth === 'close';

  const frontImagePath = ownPath(body.frontPath, user.id);
  const backImagePath = ownPath(body.backPath, user.id);

  const check = await prisma.identityDocumentCheck.create({
    data: {
      identityVerificationId: verification.id,
      frontImagePath,
      backImagePath,
      nameScore: Math.min(1, Math.max(0, Math.round(name.score * 10000) / 10000)),
      documentValid: true,
      documentNumberLast4: last4 ?? null,
      nameMatch,
      birthdateMatch,
      documentStatus,
    },
  });
  await logVerificationEvent(verification.id, 'DOCUMENT_SCANNED', {
    checkId: check.id, name: name.status, nameScore: Math.round(name.score * 100) / 100,
    birthdate: birth, place, signaturePresent: payload.signed,
  });
  if (consistent) await logVerificationEvent(verification.id, 'DOCUMENT_VERIFIED', { checkId: check.id });
  else if (frontImagePath && backImagePath) {
    await requestAdminReview(check.id, new URL(req.url).origin, 'The QR code was read but the name or birthdate on the ID did not clearly match the account.');
  }

  // What the person's own ID said, shown back to them once. Nothing here is
  // stored except the last 4 digits and the yes/no results above.
  const cardBirth = prettyDate(payload.birthdate);
  return NextResponse.json({
    ok: true,
    needsReview: !consistent,
    nameMatch,
    birthdateMatch,
    last4: last4 ?? null,
    frontImageUrl: frontImagePath ? photoUrl(frontImagePath) : null,
    comparison: {
      name: { status: name.status, card: cardDisplayName(payload), account: user.fullname },
      birthdate: {
        status: birth,
        card: cardBirth,
        cardAge: payload.birthdate ? ageFrom(payload.birthdate) : null,
      },
      place: { status: place, card: payload.address ?? payload.placeOfBirth ?? null },
    },
  });
}
