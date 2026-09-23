import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';

const MIN_AGE = 18;
const MAX_AGE = 120;

/** POST { birthdate: "yyyy-mm-dd" } — saves the private personal details.
 * The birthdate is never shown to buyers; it exists to match the account
 * against the National ID. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw = String(body?.birthdate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return NextResponse.json({ error: 'Choose your date of birth.' }, { status: 400 });
  }

  // Parsed as UTC midnight so the stored date can't drift a day either way.
  const birthdate = new Date(raw + 'T00:00:00.000Z');
  if (Number.isNaN(birthdate.getTime()) || birthdate.toISOString().slice(0, 10) !== raw) {
    return NextResponse.json({ error: 'That date does not exist. Please check it.' }, { status: 400 });
  }
  if (birthdate.getTime() > Date.now()) {
    return NextResponse.json({ error: 'Your date of birth cannot be in the future.' }, { status: 400 });
  }

  const years = (Date.now() - birthdate.getTime()) / (365.2425 * 24 * 3600 * 1000);
  if (years < MIN_AGE) {
    return NextResponse.json({ error: `You must be at least ${MIN_AGE} to sell on AniTime.` }, { status: 400 });
  }
  if (years > MAX_AGE) {
    return NextResponse.json({ error: 'Please check your date of birth.' }, { status: 400 });
  }

  // The profile picture is saved separately (/api/profile/photo), the moment it
  // is uploaded, so it must not be touched here.
  const sex = String(body?.sex ?? '');
  if (sex !== 'Male' && sex !== 'Female') {
    return NextResponse.json({ error: 'Select your sex (Male or Female).' }, { status: 400 });
  }
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, birthdate, sex },
    update: { birthdate, sex },
  });

  return NextResponse.json({ ok: true });
}
