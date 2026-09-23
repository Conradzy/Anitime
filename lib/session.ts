import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export const SESSION_COOKIE = 'anitime_session';
export const SESSION_MAX_AGE = 60 * 60 * 24; // 1 day, default (not "keep me signed in")
export const SESSION_MAX_AGE_EXTENDED = 60 * 60 * 24 * 30; // 30 days, "keep me signed in"

export type SessionPayload = {
  userId: number;
  email: string;
  sid: string; // id of the Session row (see lib/session-store.ts)
};

export function signSession(payload: SessionPayload, maxAgeSeconds: number): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: maxAgeSeconds });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
