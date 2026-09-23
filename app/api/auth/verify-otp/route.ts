import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';
import { maskPhone } from '@/lib/phone';
import { MAX_VERIFY_ATTEMPTS, compareCode } from '@/lib/otp';

/** POST { code } — checks the SMS code and, on success, saves the number as
 * this account's verified mobile number. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from the text message.' }, { status: 400 });
  }

  const otp = await prisma.phoneOtp.findFirst({
    where: { userId: user.id, status: 'PENDING' },
    orderBy: { id: 'desc' },
  });
  if (!otp) {
    return NextResponse.json({ error: 'Request a new code first.' }, { status: 400 });
  }
  if (otp.expiresAt < new Date()) {
    await prisma.phoneOtp.update({ where: { id: otp.id }, data: { status: 'EXPIRED' } });
    return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 400 });
  }
  if (otp.attemptCount >= MAX_VERIFY_ATTEMPTS) {
    await prisma.phoneOtp.update({ where: { id: otp.id }, data: { status: 'CANCELLED' } });
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  if (!(await compareCode(code, otp.codeHash))) {
    await prisma.phoneOtp.update({ where: { id: otp.id }, data: { attemptCount: { increment: 1 } } });
    const left = MAX_VERIFY_ATTEMPTS - otp.attemptCount - 1;
    return NextResponse.json(
      { error: left > 0 ? `That code doesn't match. ${left} attempt${left === 1 ? '' : 's'} left.` : 'That code doesn\'t match. Request a new code.' },
      { status: 400 }
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.phoneOtp.update({ where: { id: otp.id }, data: { status: 'VERIFIED', verifiedAt: now } }),
    prisma.user.update({ where: { id: user.id }, data: { phoneNumber: otp.phone, phoneVerified: now } }),
  ]);

  return NextResponse.json({ verified: true, phoneMasked: maskPhone(otp.phone) });
}
