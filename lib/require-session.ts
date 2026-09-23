import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';

/** For layouts of signed-in-only pages: checks the session against the
 * database on every request and sends visitors without one to the login page. */
export async function requireSession() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth');
  return user;
}

/** For the login page and landing page: someone with a real, active session
 * goes straight to their home (sellers: dashboard, buyers: the market feed). A stale or revoked cookie does NOT count as
 * signed in, so it can never cause a redirect loop. */
export async function redirectIfSignedIn() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'BUYER' ? '/seller-home' : '/dashboard');
}
