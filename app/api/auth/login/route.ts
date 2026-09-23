import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, SESSION_MAX_AGE, SESSION_MAX_AGE_EXTENDED } from '@/lib/session';
import { startSession } from '@/lib/session-store';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const keepSignedIn = Boolean(body.keepSignedIn);

    if (!email || !password) {
      return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Same generic message whether the email doesn't exist or the password
    // is wrong — don't let a login form confirm which emails are registered.
    const invalid = () => NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });

    if (!user) return invalid();

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) return invalid();

    if (!user.emailVerified) {
      return NextResponse.json(
        { error: 'NOT_VERIFIED', message: 'Please verify your email before logging in.' },
        { status: 403 }
      );
    }

    const maxAge = keepSignedIn ? SESSION_MAX_AGE_EXTENDED : SESSION_MAX_AGE;
    const token = await startSession(user, maxAge, req.headers.get('user-agent'));

    const res = NextResponse.json({ success: true, role: user.role });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    return res;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
