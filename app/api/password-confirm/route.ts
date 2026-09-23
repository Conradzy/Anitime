import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

/** POST { token } — the emailed link was confirmed: the pending password
 * becomes the real one and every session is signed out. A POST (not a plain
 * link click) so mail scanners that open links can't confirm it by accident. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? '');
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: 'This link is not valid.' }, { status: 400 });

  const request = await prisma.passwordChangeRequest.findUnique({
    where: { tokenHash: createHash('sha256').update(token).digest('hex') },
  });
  if (!request || request.usedAt) return NextResponse.json({ error: 'This link was already used or is not valid.' }, { status: 400 });
  if (request.expiresAt < new Date()) return NextResponse.json({ error: 'This link has expired. Request the change again.' }, { status: 400 });

  await prisma.$transaction([
    prisma.user.update({ where: { id: request.userId }, data: { passwordHash: request.newPasswordHash } }),
    prisma.passwordChangeRequest.update({ where: { id: request.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: request.userId } }),
  ]);
  return NextResponse.json({ ok: true });
}
