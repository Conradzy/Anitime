import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { isSessionActive } from '@/lib/session-store';

/** Server-only: resolves the signed-in user from the session cookie, or null.
 * The cookie must be validly signed AND its session must still exist in the
 * database (logging out deletes it). */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySession(token);
  if (!payload || !(await isSessionActive(payload))) return null;

  return prisma.user.findUnique({ where: { id: payload.userId } });
}
