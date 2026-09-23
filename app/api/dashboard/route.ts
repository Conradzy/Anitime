import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/marketplace';
import { RANGES, type Range, dashboardData, transactionPage } from '@/lib/dashboard';

/** GET ?range=30D — every number the dashboard shows, for this user only. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const asked = new URL(req.url).searchParams.get('range');
  const range: Range = (RANGES as readonly string[]).includes(asked ?? '') ? (asked as Range) : '30D';

  const [data, transactions] = await Promise.all([dashboardData(user.id, range), transactionPage(user.id, 1)]);
  return NextResponse.json({ ...data, transactions });
}
