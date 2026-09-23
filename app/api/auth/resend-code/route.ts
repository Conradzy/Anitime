import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueVerificationCode } from '@/lib/issue-verification-code';
import { RESEND_COOLDOWN_MS } from '@/lib/otp';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Missing email.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'No account found for this email.' }, { status: 404 });
    }
    if (user.emailVerified) {
      return NextResponse.json({ error: 'This account is already verified. Try logging in.' }, { status: 400 });
    }

    const latest = await prisma.verificationCode.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return NextResponse.json({ error: `Please wait ${secondsLeft}s before requesting another code.`, secondsLeft }, { status: 429 });
      }
    }

    await issueVerificationCode(user.id, user.email);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Resend code error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
