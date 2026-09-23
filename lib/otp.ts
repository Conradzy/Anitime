import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const RESEND_COOLDOWN_MS = 42 * 1000; // matches the countdown already in the UI
export const MAX_VERIFY_ATTEMPTS = 5; // per issued code, then it's dead — request a new one

export function generateCode(): string {
  return crypto.randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, '0');
}

export function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export function compareCode(code: string, codeHash: string): Promise<boolean> {
  return bcrypt.compare(code, codeHash);
}
