import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/marketplace';
import { transactionPage } from '@/lib/dashboard';

/** GET ?page=2 — one page of past deals for the dashboard's "See all" table. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const page = Math.max(1, Number(new URL(req.url).searchParams.get('page') ?? 1) || 1);
  return NextResponse.json(await transactionPage(user.id, page));
}
