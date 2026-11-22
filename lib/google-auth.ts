import { OAuth2Client, type TokenPayload } from 'google-auth-library';

// OAuth client IDs are public identifiers, not secrets. Override for another deployment.
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '863914614207-87f713kjfet5353gar6o8q3irsi4r0qp.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export function googleIdentity(payload: TokenPayload | undefined, nonce: string) {
  if (!payload?.sub || !payload.email || payload.email_verified !== true || (payload as TokenPayload & { nonce?: string }).nonce !== nonce) {
    throw new Error('Invalid Google identity or sign-in challenge.');
  }
  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: (payload.name || '').trim().slice(0, 120),
    authoritativeEmail: payload.email.toLowerCase().endsWith('@gmail.com') || Boolean(payload.hd),
  };
}

export async function verifyGoogleCredential(credential: string, nonce: string) {
  const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
  return googleIdentity(ticket.getPayload(), nonce);
}
