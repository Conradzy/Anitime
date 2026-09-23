import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/session';
import { endSession } from '@/lib/session-store';

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Delete the server-side session first, so the old cookie is dead even if
  // someone kept a copy of it.
  await endSession(token).catch((e) => console.error('Logout: could not end session', e));

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
