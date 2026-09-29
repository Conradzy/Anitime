import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, sellerBadges, serializeBuyRequest } from '@/lib/marketplace';

/** GET — one buy request, plus its recently completed transactions (each
 * showing the seller who fulfilled part of it, and the review left for
 * them), so a buyer's post reads like a running record of who has already
 * sold into it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const id = Number((await params).id);
  const r = await prisma.buyRequest.findUnique({
    where: { id },
    include: { photos: { orderBy: { position: 'asc' } } },
  });
  if (!r) return NextResponse.json({ error: 'Buy request not found.' }, { status: 404 });

  const badge = (await sellerBadges([r.buyerId])).get(r.buyerId);

  const deals = await prisma.transaction.findMany({
    where: { buyRequestId: id, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    take: 20,
    include: { reviews: { where: { reviewerId: r.buyerId }, select: { rating: true, comment: true } } },
  });
  const sellerBadgeMap = await sellerBadges(deals.map((d) => d.sellerId));

  return NextResponse.json({
    request: { ...serializeBuyRequest(r), buyer: badge ?? null, mine: r.buyerId === user.id },
    completed: deals.map((d) => ({
      id: d.id,
      code: d.transactionCode,
      quantity: Number(d.quantity),
      unit: d.unit,
      agreedUnitPrice: Number(d.agreedUnitPrice),
      totalAmount: Number(d.totalAmount),
      completedAt: d.completedAt ? d.completedAt.toISOString() : null,
      seller: sellerBadgeMap.get(d.sellerId) ?? null,
      review: d.reviews[0] ? { rating: d.reviews[0].rating, comment: d.reviews[0].comment } : null,
    })),
  });
}

/** PATCH { action: 'close' } — the buyer takes the post down before it is
 * fully filled. Anything already agreed keeps going; this only stops new
 * offers from coming in. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const id = Number((await params).id);
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const r = await prisma.buyRequest.findUnique({ where: { id } });
  if (!r || r.buyerId !== user.id) return NextResponse.json({ error: 'Buy request not found.' }, { status: 404 });
  if (action !== 'close') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  if (r.status !== 'ACTIVE') return NextResponse.json({ error: `This request is already ${r.status.toLowerCase()}.` }, { status: 409 });

  await prisma.buyRequest.update({ where: { id }, data: { status: 'CLOSED' } });
  return NextResponse.json({ ok: true });
}
