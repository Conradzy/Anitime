import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, sellerBadges } from '@/lib/marketplace';
import { TX_INCLUDE, serializeTransaction } from '@/lib/deals';

/** How long a finished deal stays on the Deliveries page before it moves to
 * the dashboard's transaction history. */
const KEEP_COMPLETED_MS = 24 * 60 * 60 * 1000;

/** GET — every deal the signed-in user is part of, as buyer or seller, soonest
 * first. This is what the Deliveries page shows. Deals completed more than a
 * day ago drop off: they live on in the dashboard's recent transactions. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const cutoff = new Date(Date.now() - KEEP_COMPLETED_MS);
  const rows = await prisma.transaction.findMany({
    where: {
      OR: [{ buyerId: user.id }, { sellerId: user.id }],
      NOT: { status: 'COMPLETED', completedAt: { lt: cutoff } },
    },
    include: TX_INCLUDE,
    orderBy: [{ scheduledAt: 'asc' }, { id: 'desc' }],
    take: 200,
  });
  const badges = await sellerBadges(rows.flatMap((r) => [r.buyerId, r.sellerId]));
  return NextResponse.json({ transactions: rows.map((r) => serializeTransaction(r, user.id, badges)) });
}
