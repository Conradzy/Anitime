import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { compareCode, MAX_VERIFY_ATTEMPTS } from '@/lib/otp';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';
import { startSession } from '@/lib/session-store';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();

    if (!email || code.length !== 6) {
      return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'No account found for this email.' }, { status: 404 });
    }

    // Already verified: a code must never be able to sign someone in to an
    // account that has finished verification — that takes the password.
    if (user.emailVerified) {
      return NextResponse.json({ error: 'This email is already verified. Please log in with your password.' }, { status: 409 });
    }

    const verification = await prisma.verificationCode.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      return NextResponse.json({ error: 'No verification code is pending. Request a new one.' }, { status: 400 });
    }

    if (verification.expiresAt < new Date()) {
      await prisma.verificationCode.delete({ where: { id: verification.id } });
      return NextResponse.json({ error: 'That code expired. Request a new one.' }, { status: 400 });
    }

    if (verification.attempts >= MAX_VERIFY_ATTEMPTS) {
      await prisma.verificationCode.delete({ where: { id: verification.id } });
      return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 400 });
    }

    const isMatch = await compareCode(code, verification.codeHash);
    if (!isMatch) {
      await prisma.verificationCode.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json({ error: "That code doesn't match. Check the latest email and try again." }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } }),
      prisma.verificationCode.deleteMany({ where: { userId: user.id } }),
    ]);

    const token = await startSession(user, SESSION_MAX_AGE, req.headers.get('user-agent'));
    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (error) {
    console.error('Verify email error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
