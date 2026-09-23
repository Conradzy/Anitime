import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';

const REQUIRED = ['addressLine1', 'barangay', 'municipality', 'province', 'region'] as const;
const LABELS: Record<string, string> = {
  addressLine1: 'house / unit / street',
  barangay: 'barangay',
  municipality: 'municipality or city',
  province: 'province',
  region: 'region',
};

/** POST — saves the PRIVATE residential address. This is deliberately separate
 * from a listing's farm location: buyers see the farm, never this. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = (k: string, max = 255) => String(body[k] ?? '').trim().slice(0, max);

  const data = {
    addressLine1: text('addressLine1'),
    addressLine2: text('addressLine2') || null,
    barangay: text('barangay', 150),
    municipality: text('municipality', 150),
    province: text('province', 150),
    region: text('region', 150),
    postalCode: text('postalCode', 20) || null,
    country: text('country', 100) || 'Philippines',
  };

  for (const field of REQUIRED) {
    if (!data[field]) return NextResponse.json({ error: `Enter your ${LABELS[field]}.` }, { status: 400 });
  }
  if (data.postalCode && !/^\d{4}$/.test(data.postalCode)) {
    return NextResponse.json({ error: 'A Philippine postal code is 4 digits.' }, { status: 400 });
  }

  await prisma.residentialAddress.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
