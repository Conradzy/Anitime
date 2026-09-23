import { prisma } from '@/lib/prisma';
import { sendVerificationEmail } from '@/lib/mail';
import { generateCode, hashCode, CODE_TTL_MS } from '@/lib/otp';

/** Replaces any pending code for this user with a fresh one and emails it. */
export async function issueVerificationCode(userId: number, email: string) {
  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.verificationCode.deleteMany({ where: { userId } });
  await prisma.verificationCode.create({
    data: { userId, codeHash, expiresAt },
  });

  await sendVerificationEmail(email, code);
}
