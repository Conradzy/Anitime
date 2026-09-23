import { prisma } from '@/lib/prisma';
import { signSession, verifySession, type SessionPayload } from '@/lib/session';

/** Creates a server-side session row and returns the signed cookie value for it. */
export async function startSession(
  user: { id: number; email: string },
  maxAgeSeconds: number,
  userAgent?: string | null
): Promise<string> {
  const now = new Date();
  // Housekeeping: drop sessions that have already expired.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });

  const row = await prisma.session.create({
    data: {
      userId: user.id,
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(now.getTime() + maxAgeSeconds * 1000),
    },
  });
  return signSession({ userId: user.id, email: user.email, sid: row.id }, maxAgeSeconds);
}

/** Logout: deletes the session row, so the cookie stops working everywhere. */
export async function endSession(token: string | undefined) {
  const payload = token ? verifySession(token) : null;
  if (payload?.sid) await prisma.session.deleteMany({ where: { id: payload.sid } });
}

/** True only if the session row still exists, belongs to this user and hasn't expired. */
export async function isSessionActive(payload: SessionPayload | null): Promise<boolean> {
  if (!payload?.sid) return false; // tokens from before server-side sessions are not accepted
  const row = await prisma.session.findUnique({ where: { id: payload.sid } });
  return Boolean(row && row.userId === payload.userId && row.expiresAt > new Date());
}
