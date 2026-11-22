import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GOOGLE_CLIENT_ID, verifyGoogleCredential } from '@/lib/google-auth';
import { startSession } from '@/lib/session-store';
import { SESSION_COOKIE, SESSION_MAX_AGE, SESSION_MAX_AGE_EXTENDED } from '@/lib/session';

export const runtime = 'nodejs';
const NONCE_COOKIE = 'anitime_google_nonce';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/auth/google' };
const crops = new Set(['Coconut', 'Pineapple', 'Corn', 'Banana', 'Mango']);
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Open sign-in from AniTime.' }, 403);
  const now = new Date();
  await prisma.googleSignInChallenge.deleteMany({ where: { expiresAt: { lt: now } } });
  const previous = req.cookies.get(NONCE_COOKIE)?.value;
  const existing = previous ? await prisma.googleSignInChallenge.findUnique({ where: { id: previous } }) : null;
  // Reuse across login/register tabs and React remounts without invalidating an open popup.
  const nonce = existing && existing.attempts < 8 && existing.expiresAt.getTime() > now.getTime() + 60000
    ? existing.id : randomBytes(32).toString('base64url');
  if (nonce !== existing?.id) await prisma.googleSignInChallenge.create({ data: { id: nonce, expiresAt: new Date(now.getTime() + 600000) } });
  const response = reply({ clientId: GOOGLE_CLIENT_ID, nonce });
  response.cookies.set(NONCE_COOKIE, nonce, { ...cookieOptions, maxAge: 600 });
  return response;
}

export async function POST(req: NextRequest) {
  // Next's internal URL can use localhost even when the browser uses 127.0.0.1
  // or a public proxy hostname. Compare against the actual request Host instead.
  let sameOrigin = false;
  try {
    const origin = new URL(req.headers.get('origin') || '');
    sameOrigin = ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.get('host')?.toLowerCase();
  } catch { /* Missing or malformed Origin is rejected. */ }
  if (!sameOrigin || req.headers.get('sec-fetch-site') === 'cross-site') {
    return reply({ error: 'Open sign-in from AniTime.' }, 403);
  }
  const body = await req.json().catch(() => null);
  const nonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!nonce || typeof body?.credential !== 'string' || body.credential.length > 12000 || typeof body.nonce !== 'string' || body.nonce !== nonce) {
    return reply({ error: 'Sign-in expired. Please try Google again.' }, 400);
  }
  const attempt = await prisma.googleSignInChallenge.updateMany({
    where: { id: nonce, expiresAt: { gt: new Date() }, attempts: { lt: 8 } }, data: { attempts: { increment: 1 } },
  });
  if (!attempt.count) return reply({ error: 'Sign-in expired or too many attempts. Please restart Google sign-in.' }, 429);
  let identity;
  try { identity = await verifyGoogleCredential(body.credential, nonce); }
  catch { return reply({ error: 'Google could not verify this sign-in. Please try again.' }, 401); }
  try {
    let user = await prisma.user.findUnique({ where: { googleId: identity.sub } });
    let link = false;
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: identity.email } });
      if (user) {
        if (user.googleId) return reply({ error: 'This AniTime account is linked to another Google account. Use your original sign-in.' }, 409);
        if (!user.emailVerified) return reply({ error: 'Verify your existing AniTime email account first, then link Google.' }, 403);
        if (typeof body.password !== 'string' || !body.password) return reply({ step: 'link', email: identity.email, name: identity.name });
        if (body.password.length > 256 || !await bcrypt.compare(body.password, user.passwordHash)) return reply({ error: 'Incorrect AniTime password. Please try again.' }, 401);
        link = true;
      } else {
        // Google cannot confirm current ownership of third-party email inboxes.
        if (!identity.authoritativeEmail) return reply({ error: 'For this email provider, register and verify your email with AniTime first, then link Google.' }, 403);
        if (!body.registration) return reply({ step: 'register', email: identity.email, name: identity.name });
        const registration = body.registration;
        const products: string[] = Array.isArray(registration.products) ? [...new Set<string>(registration.products.filter((item: unknown) => typeof item === 'string' && crops.has(item)))] : [];
        if (!['SELLER', 'BUYER'].includes(registration.role) || !products.length || registration.agreeTerms !== true) return reply({ error: 'Choose an account type, select produce and accept the terms.' }, 400);
        const fullname = String(registration.fullname || identity.name).trim().slice(0, 120);
        if (!fullname) return reply({ error: 'Enter your full name.' }, 400);
        // No shared/default password: Google accounts use Google to authenticate.
        const passwordHash = await bcrypt.hash(randomBytes(48).toString('base64url'), 12);
        const created = await prisma.$transaction(async tx => {
          const consumed = await tx.googleSignInChallenge.deleteMany({ where: { id: nonce, expiresAt: { gt: new Date() } } });
          if (!consumed.count) throw new Error('CHALLENGE_USED');
          return tx.user.create({ data: { fullname, email: identity.email, googleId: identity.sub, emailVerified: new Date(),
            businessname: String(registration.businessname || '').trim().slice(0, 160) || null,
            product: products.join(', '), role: registration.role, buyerTier: registration.role === 'BUYER' ? 'BASIC' : null, passwordHash } });
        });
        return signedIn(created, body.keepSignedIn === true, req);
      }
    }
    const account = user;
    await prisma.$transaction(async tx => {
      const consumed = await tx.googleSignInChallenge.deleteMany({ where: { id: nonce, expiresAt: { gt: new Date() } } });
      if (!consumed.count) throw new Error('CHALLENGE_USED');
      if (link) {
        const linked = await tx.user.updateMany({ where: { id: account.id, googleId: null, passwordHash: account.passwordHash }, data: { googleId: identity.sub } });
        if (!linked.count) throw new Error('ACCOUNT_CHANGED');
      }
    });
    return signedIn(account, body.keepSignedIn === true, req);
  } catch {
    return reply({ error: 'Could not complete sign-in. Please restart Google sign-in or use your existing account.' }, 409);
  }
}

async function signedIn(user: { id: number; email: string; role: string }, keepSignedIn: boolean, req: NextRequest) {
  const maxAge = keepSignedIn ? SESSION_MAX_AGE_EXTENDED : SESSION_MAX_AGE;
  const token = await startSession(user, maxAge, req.headers.get('user-agent'));
  const response = reply({ success: true, role: user.role });
  response.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, path: '/', maxAge });
  response.cookies.set(NONCE_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
