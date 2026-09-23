import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

// Pages that need a signed-in user.
const PROTECTED = ['/dashboard', '/seller-home', '/messages', '/deliveries', '/almanac', '/account', '/profile'];

/** Fast first check for protected pages: no validly signed cookie -> /auth
 * (and the bad cookie is cleared). Protected pages are sent "no-store" so Back
 * after logging out asks the server again instead of showing a cached copy.
 *
 * This deliberately does NOT redirect signed-in users away from /auth or the
 * landing page: a cookie can be validly signed yet already revoked, and only
 * the database knows. Those redirects happen in the server layouts, which
 * check the real session (see lib/require-session.ts). */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (isProtected) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const payload = token ? verifySession(token) : null;
    if (!payload?.sid) {
      const res = NextResponse.redirect(new URL('/auth', req.url));
      if (token) res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
  }

  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const config = {
  matcher: ['/auth', '/account/:path*', '/dashboard/:path*', '/seller-home/:path*', '/messages/:path*', '/deliveries/:path*', '/almanac/:path*', '/profile/:path*'],
};
