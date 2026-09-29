import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, sellerBadges } from '@/lib/marketplace';

/** GET — the signed-in user's chats (as buyer or seller), newest first. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const rows = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      listing: { select: { id: true, crop: true, variety: true, unit: true, unitPrice: true, availableQuantity: true, status: true } },
      buyRequest: { select: { id: true, crop: true, variety: true, unit: true, targetPrice: true, remainingQuantity: true, status: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { _count: { select: { attachments: true } } } },
      _count: { select: { messages: { where: { readAt: null, senderId: { not: user.id }, type: { not: 'SYSTEM' } } } } },
    },
  });
  const badges = await sellerBadges(rows.flatMap((r) => [r.buyerId, r.sellerId]));

  return NextResponse.json({
    conversations: rows.map((c) => {
      const otherId = c.buyerId === user.id ? c.sellerId : c.buyerId;
      const last = c.messages[0];
      const listing = c.listing
        ? {
            id: c.listing.id,
            title: `${c.listing.crop} — ${c.listing.variety}`,
            unit: c.listing.unit,
            unitPrice: Number(c.listing.unitPrice),
            availableQuantity: Number(c.listing.availableQuantity),
            kind: 'LISTING' as const,
          }
        : {
            id: c.buyRequest!.id,
            title: `Wants: ${c.buyRequest!.crop} — ${c.buyRequest!.variety}`,
            unit: c.buyRequest!.unit,
            unitPrice: c.buyRequest!.targetPrice === null ? 0 : Number(c.buyRequest!.targetPrice),
            availableQuantity: Number(c.buyRequest!.remainingQuantity),
            kind: 'BUY_REQUEST' as const,
          };
      return {
        id: c.id,
        role: c.buyerId === user.id ? 'BUYER' : 'SELLER',
        other: badges.get(otherId) ?? null,
        listing,
        lastMessage: last
          ? last.type === 'OFFER'
            ? 'Sent an offer'
            : (last.body ?? (last._count.attachments ? 'Sent a photo' : ''))
          : '',
        lastMessageAt: c.lastMessageAt.toISOString(),
        unread: c._count.messages,
      };
    }),
  });
}

/** POST { listingId } — "Chat with seller": finds or creates the buyer's chat
 *   for that specific listing.
 * POST { buyRequestId } — "Respond to this request": finds or creates the
 *   chat a SELLER starts to fulfill someone else's buy request. Here the
 *   signed-in user becomes the seller side; the buyer is whoever posted it. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);

  if (body?.buyRequestId != null) {
    const buyRequestId = Number(body.buyRequestId);
    if (!Number.isInteger(buyRequestId)) return NextResponse.json({ error: 'Missing buy request.' }, { status: 400 });
    const request = await prisma.buyRequest.findUnique({ where: { id: buyRequestId } });
    if (!request || request.status !== 'ACTIVE') return NextResponse.json({ error: 'Buy request not found.' }, { status: 404 });
    if (request.buyerId === user.id) return NextResponse.json({ error: "You can't respond to your own request." }, { status: 400 });

    const conversation = await prisma.conversation.upsert({
      where: { buyRequestId_sellerId: { buyRequestId, sellerId: user.id } },
      create: { buyRequestId, buyerId: request.buyerId, sellerId: user.id },
      update: {},
    });
    return NextResponse.json({ id: conversation.id });
  }

  const listingId = Number(body?.listingId);
  if (!Number.isInteger(listingId)) return NextResponse.json({ error: 'Missing listing.' }, { status: 400 });

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status === 'DRAFT') return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  if (listing.sellerId === user.id) return NextResponse.json({ error: "You can't chat about your own listing." }, { status: 400 });

  const conversation = await prisma.conversation.upsert({
    where: { listingId_buyerId: { listingId, buyerId: user.id } },
    create: { listingId, buyerId: user.id, sellerId: listing.sellerId },
    update: {},
  });
  return NextResponse.json({ id: conversation.id });
}
