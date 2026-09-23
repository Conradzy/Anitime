import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { issueVerificationCode } from '@/lib/issue-verification-code';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fullname = String(body.fullname || '').trim();
    const businessname = String(body.businessname || '').trim();
    const product = String(body.product || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    // Sellers list produce; buyers (traders) purchase it. Buyers start at the BASIC tier.
    const role = body.role === 'BUYER' ? ('BUYER' as const) : ('SELLER' as const);
    const buyerTier = role === 'BUYER' ? ('BASIC' as const) : null;

    if (!fullname || !email || !password || !product) {
      return NextResponse.json({ error: 'Please fill in your name, produce, email and password.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await prisma.user.findUnique({ where: { email } });

    let userId: number;
    if (existing) {
      if (existing.emailVerified) {
        // Real, already-active account — don't let a stranger overwrite it
        // just by re-submitting the register form with this email.
        return NextResponse.json({ error: 'An account with this email already exists. Try logging in instead.' }, { status: 409 });
      }
      // Abandoned an earlier registration before verifying — update their
      // details and re-send a code instead of dead-ending them here.
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { fullname, businessname: businessname || null, product, passwordHash, role, buyerTier },
      });
      userId = updated.id;
    } else {
      const created = await prisma.user.create({
        data: { fullname, businessname: businessname || null, product, email, passwordHash, role, buyerTier },
      });
      userId = created.id;
    }

    try {
      await issueVerificationCode(userId, email);
    } catch (mailError) {
      console.error('Failed to send verification email:', mailError);
      return NextResponse.json(
        { error: 'Your account was created, but we could not send the verification email. Try resending the code.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
