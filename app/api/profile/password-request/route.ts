import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';
import { sendPasswordChangeEmail } from '@/lib/mail';

const TTL_MS = 30 * 60 * 1000;

/** POST { currentPassword, newPassword } — does NOT change the password. It
 * stores the new one (hashed) and emails the account's address a confirmation
 * link; the password only changes when that link is confirmed. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const currentPassword = String(body?.currentPassword ?? '');
  const newPassword = String(body?.newPassword ?? '');

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: 'Your current password is not correct.' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'The new password must be at least 8 characters.' }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: 'Choose a password different from your current one.' }, { status: 400 });
  }

  const recent = await prisma.passwordChangeRequest.findFirst({
    where: { userId: user.id, usedAt: null, createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent) {
    return NextResponse.json({ error: 'A confirmation email was just sent. Wait a minute before asking again.' }, { status: 429 });
  }

  const token = randomBytes(32).toString('hex');
  await prisma.passwordChangeRequest.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordChangeRequest.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      newPasswordHash: await bcrypt.hash(newPassword, 12),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '');
  try {
    await sendPasswordChangeEmail(user.email, { name: user.fullname, link: `${base}/confirm-password/${token}` });
  } catch (e) {
    console.error('password change email failed', e);
    return NextResponse.json({ error: 'We could not send the confirmation email. Please try again.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, email: user.email });
}
