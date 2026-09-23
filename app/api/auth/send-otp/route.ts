import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';
import { normalizePhPhone } from '@/lib/phone';
import { SmsError, otpMessage, sendSms, smsConfigured } from '@/lib/philsms';
import { CODE_TTL_MS, RESEND_COOLDOWN_MS, generateCode, hashCode } from '@/lib/otp';

/** POST { phone } — texts a 6-digit code to a Philippine mobile number.
 * Only the hash of the code is stored. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = normalizePhPhone(String(body?.phone ?? ''));
  if (!phone) {
    return NextResponse.json({ error: 'Enter a valid Philippine mobile number, like 0917 123 4567.' }, { status: 400 });
  }

  // A verified number belongs to one account only.
  const taken = await prisma.user.findFirst({
    where: { phoneNumber: phone, phoneVerified: { not: null }, id: { not: user.id } },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json({ error: 'That mobile number is already verified on another account.' }, { status: 409 });
  }

  const recent = await prisma.phoneOtp.findFirst({
    where: { userId: user.id, status: 'PENDING' },
    orderBy: { id: 'desc' },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 1000);
    return NextResponse.json({ error: `Please wait ${wait}s before requesting another code.` }, { status: 429 });
  }

  const code = generateCode();
  const codeHash = await hashCode(code);

  // Supersede any earlier codes, so only the newest one can be used.
  await prisma.$transaction([
    prisma.phoneOtp.updateMany({ where: { userId: user.id, status: 'PENDING' }, data: { status: 'CANCELLED' } }),
    prisma.phoneOtp.create({
      data: {
        userId: user.id, phone, codeHash,
        purpose: user.phoneVerified ? 'PHONE_CHANGE' : 'PHONE_VERIFICATION',
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    }),
  ]);

  try {
    await sendSms(phone, otpMessage(code), code);
  } catch (e) {
    // While developing, show PhilSMS's actual reason; in production people
    // only ever see the generic message.
    const dev = process.env.NODE_ENV !== 'production' && e instanceof SmsError ? ` (${e.reason})` : '';
    return NextResponse.json(
      { error: `We could not send the code right now. Please try again in a moment.${dev}` },
      { status: 502 }
    );
  }

  // With no PhilSMS token configured the code is only printed to the dev
  // terminal; the UI says so rather than claiming a text was sent.
  if (!smsConfigured) console.warn(`[send-otp] dev code for ${phone}: ${code}`);
  return NextResponse.json({ sent: true, delivered: smsConfigured, cooldownMs: RESEND_COOLDOWN_MS });
}
