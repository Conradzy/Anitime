import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notify';
import { requireUser } from '@/lib/marketplace';

/** POST { rating: 1-5, comment? } — once a deal is COMPLETED, each side rates the
 * other exactly once: the buyer rates the seller, the seller rates the buyer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const id = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { rating?: unknown; comment?: unknown };
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Choose 1 to 5 stars.' }, { status: 400 });
  }
  const comment = String(body.comment ?? '').trim().slice(0, 500) || null;

  const t = await prisma.transaction.findUnique({ where: { id } });
  if (!t || (t.buyerId !== user.id && t.sellerId !== user.id)) {
    return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  }
  if (t.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'You can review once both of you have completed the deal.' }, { status: 409 });
  }

  const revieweeId = t.buyerId === user.id ? t.sellerId : t.buyerId;
  try {
    await prisma.review.create({ data: { transactionId: id, reviewerId: user.id, revieweeId, rating, comment } });
  } catch {
    // the (transactionId, reviewerId) pair is unique
    return NextResponse.json({ error: 'You already reviewed this deal.' }, { status: 409 });
  }
  await notify({
    userId: revieweeId,
    type: 'REVIEW',
    title: `${user.fullname} left you a ${rating}-star review`,
    body: comment ?? `Deal ${t.transactionCode}.`,
    link: '/deliveries',
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
